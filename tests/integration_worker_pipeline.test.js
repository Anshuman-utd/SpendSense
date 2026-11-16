import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import mongoose from "mongoose";
import IORedis from "ioredis";
import { Worker } from "bullmq";

// Load .env if present
try {
  process.loadEnvFile();
} catch (_) {}

import ImportJob from "../src/models/ImportJob.js";
import ImportedTransaction from "../src/models/ImportedTransaction.js";
import Expense from "../src/models/Expense.js";
import FinancialAccount from "../src/models/FinancialAccount.js";
import User from "../src/models/User.js";
import { uploadToGridFS, deleteFromGridFS } from "../src/lib/gridfs.js";
import {
  QUEUE_NAME,
  getImportQueue,
  addImportJob,
  addConfirmJob,
  isQueueAvailable,
  getRedisOptions,
  sanitizeRedisUrl,
  isSyncAllowed,
  closeQueue,
} from "../src/lib/queue.js";
import {
  processImportJob,
  confirmImport,
} from "../src/lib/imports/importService.js";

const TEST_REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
// Use isolated spendsense_test database
const RAW_MONGO_URI = process.env.MONGODB_URI;
const TEST_MONGO_URI = RAW_MONGO_URI
  ? RAW_MONGO_URI.replace(/\.net\/[^?]*\?/, ".net/spendsense_test?")
  : "mongodb://localhost:27017/spendsense_test";
process.env.MONGODB_URI = TEST_MONGO_URI;

let isEnvironmentAvailable = false;
let testWorker = null;
let testRedisClient = null;
let testUserId = null;
let testAccountId = null;
let createdJobIds = [];

// Probe environment before running live integration tests
test.before(async () => {
  try {
    // Probe Redis
    testRedisClient = new IORedis(TEST_REDIS_URL, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    testRedisClient.on("error", () => {});
    await testRedisClient.connect();
    const pong = await testRedisClient.ping();
    if (pong !== "PONG") {
      console.log(
        "[Integration Tests] Redis ping failed. Skipping live integration tests.",
      );
      return;
    }

    // Clean stale queue jobs before test
    const queue = getImportQueue();
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => {});
    }

    // Probe MongoDB
    await mongoose.connect(TEST_MONGO_URI, { bufferCommands: false });
    isEnvironmentAvailable = true;
    console.log(
      "[Integration Tests] Successfully connected to live Redis and isolated MongoDB test DB.",
    );

    // Create test user and financial account
    const user = await User.create({
      name: "Integration Test User",
      email: `test_worker_${Date.now()}@example.com`,
      password: "hashedpassword123",
    });
    testUserId = user._id;

    const account = await FinancialAccount.create({
      userId: testUserId,
      accountName: "Test Integration Account",
      accountType: "savings",
      currency: "INR",
    });
    testAccountId = account._id;
  } catch (err) {
    if (testRedisClient) {
      testRedisClient.disconnect();
    }
    console.log(
      `[Integration Tests] Prerequisites not met (${err.message}). Live tests will be skipped.`,
    );
    isEnvironmentAvailable = false;
  }
});

test.after(async () => {
  if (isEnvironmentAvailable) {
    try {
      if (testWorker) {
        await testWorker.close();
      }
      // Clean up test data from spendsense_test
      if (createdJobIds.length > 0) {
        await ImportJob.deleteMany({ _id: { $in: createdJobIds } });
        await ImportedTransaction.deleteMany({
          importJobId: { $in: createdJobIds },
        });
        await Expense.deleteMany({ userId: testUserId });
      }
      if (testAccountId) {
        await FinancialAccount.deleteOne({ _id: testAccountId });
      }
      if (testUserId) {
        await User.deleteOne({ _id: testUserId });
      }
      if (testRedisClient) {
        await testRedisClient.quit();
      }
      await closeQueue();
      await mongoose.disconnect();
      console.log(
        "[Integration Tests] Cleaned up test database and disconnected.",
      );
    } catch (err) {
      console.warn("[Integration Tests] Cleanup error:", err.message);
    }
  }
});

test("Integration: Producer and Worker Redis options are strictly separated and sanitized", () => {
  // 1. Sanitization
  const sensitiveUrl =
    "redis://default:supersecretpassword123@redis-cluster.railway.internal:6379/0";
  const sanitized = sanitizeRedisUrl(sensitiveUrl);
  assert.ok(
    !sanitized.includes("supersecretpassword123"),
    "Secrets must not appear in sanitized URL",
  );
  assert.ok(
    sanitized.includes("redis-cluster.railway.internal:6379"),
    "Host and port must be preserved",
  );

  // 2. Producer configuration
  const producerOpts = getRedisOptions("redis://localhost:6379", false);
  assert.equal(
    producerOpts.maxRetriesPerRequest,
    1,
    "Producer must have bounded retries",
  );
  assert.equal(
    producerOpts.enableOfflineQueue,
    false,
    "Producer must not buffer commands indefinitely",
  );
  assert.equal(
    producerOpts.connectTimeout,
    5000,
    "Producer must enforce connect timeout",
  );

  // 3. Worker configuration
  const workerOpts = getRedisOptions("redis://localhost:6379", true);
  assert.equal(
    workerOpts.maxRetriesPerRequest,
    null,
    "Worker must allow BullMQ blocking commands",
  );
});

test("Integration: Synchronous import overrides are strictly disabled in production", () => {
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const reqWithSync = {
      url: "https://spendsense.com/api/imports/upload?sync=true",
    };
    assert.equal(
      isSyncAllowed(reqWithSync),
      false,
      "sync=true must be rejected in production",
    );

    process.env.SYNC_PROCESSING = "true";
    assert.equal(
      isSyncAllowed(reqWithSync),
      false,
      "SYNC_PROCESSING must be rejected in production",
    );

    process.env.NODE_ENV = "development";
    assert.equal(
      isSyncAllowed(reqWithSync),
      true,
      "sync=true is allowed in development",
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    delete process.env.SYNC_PROCESSING;
  }
});

test("Integration: Live BullMQ worker processes statement import end-to-end", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  let workerRedis = null;
  try {
    // 1. Setup sample CSV and upload to GridFS
    const csvContent = `Date,Narration,Withdrawal,Deposit
12/11/2026,SWIGGY BANGALORE,450.00,
13/11/2026,UBER TRIP,320.00,
14/11/2026,NETFLIX SUBSCRIPTION,649.00,
15/11/2026,SALARY CREDIT,,50000.00
16/11/2026,AMAZON INDIA,1299.00,`;
    const buffer = Buffer.from(csvContent, "utf-8");
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    const gridFSFileId = await uploadToGridFS({
      buffer,
      filename: "live_test_statement.csv",
      contentType: "text/csv",
      metadata: { userId: testUserId, accountId: testAccountId, checksum },
    });

    // 2. Create ImportJob document
    const job = await ImportJob.create({
      userId: testUserId,
      accountId: testAccountId,
      originalFilename: "live_test_statement.csv",
      fileChecksum: checksum,
      fileSize: buffer.length,
      gridFSFileId,
      currency: "INR",
      status: "processing",
      selectedMapping: {
        date: "Date",
        description: "Narration",
        withdrawal: "Withdrawal",
        deposit: "Deposit",
      },
      progress: { stage: "Queued", percent: 5 },
    });
    createdJobIds.push(job._id);

    // 3. Initialize live BullMQ Worker
    workerRedis = new IORedis(
      TEST_REDIS_URL,
      getRedisOptions(TEST_REDIS_URL, true),
    );
    testWorker = new Worker(
      QUEUE_NAME,
      async (bJob) => {
        console.log(
          `[Integration Worker] Received job: ${bJob.name} (${bJob.id})`,
        );
        if (bJob.name === "process-import") {
          return await processImportJob(bJob.data.importJobId);
        }
        if (bJob.name === "confirm-import") {
          return await confirmImport(
            bJob.data.importJobId,
            bJob.data.transactionIds,
          );
        }
      },
      { connection: workerRedis, concurrency: 1 },
    );
    testWorker.on("error", () => {});
    await testWorker.waitUntilReady();

    let jobCompletedPromise = new Promise((resolve, reject) => {
      const onComplete = (j) => {
        if (
          j.data?.importJobId === job._id.toString() &&
          j.name === "process-import"
        ) {
          console.log(
            `[Integration Worker] Completed job: ${j.name} (${j.id})`,
          );
          testWorker.off("completed", onComplete);
          resolve(j);
        }
      };
      const onFailed = (j, err) => {
        if (
          j?.data?.importJobId === job._id.toString() &&
          j?.name === "process-import"
        ) {
          console.error(
            `[Integration Worker] Failed job: ${j?.name} (${j?.id}):`,
            err,
          );
          testWorker.off("failed", onFailed);
          reject(err);
        }
      };
      testWorker.on("completed", onComplete);
      testWorker.on("failed", onFailed);
    });

    // 4. Enqueue BullMQ job via addImportJob
    const enqueued = await addImportJob(job._id.toString());
    assert.ok(enqueued, "Job must be successfully enqueued to BullMQ");
    assert.equal(enqueued.id, `process-${job._id.toString()}`);

    // 5. Wait for worker to finish processing
    await jobCompletedPromise;

    // 6. Verify ImportJob state in MongoDB
    const updatedJob = await ImportJob.findById(job._id);
    assert.equal(
      updatedJob.status,
      "ready_for_review",
      "Job must transition to ready_for_review",
    );
    assert.equal(updatedJob.totalRows, 5, "Must parse exactly 5 rows");

    // 7. Verify ImportedTransaction records staged in MongoDB
    const staged = await ImportedTransaction.find({ importJobId: job._id });
    assert.equal(
      staged.length,
      5,
      "Must stage exactly 5 ImportedTransaction records",
    );
    assert.ok(
      staged.some((t) => (t.merchant || "").toLowerCase().includes("swiggy")),
      "Swiggy merchant extracted",
    );
    assert.ok(
      staged.some((t) => t.direction === "credit"),
      "Salary detected as credit",
    );

    // 8. Test Confirmation Pipeline: Atomic claim -> confirmation_queued -> importing -> completed
    const claimed = await ImportJob.findOneAndUpdate(
      {
        _id: job._id,
        status: { $in: ["ready_for_review", "partially_completed"] },
      },
      { $set: { status: "confirmation_queued" } },
      { new: true },
    );
    assert.equal(
      claimed.status,
      "confirmation_queued",
      "Atomic claim sets confirmation_queued",
    );

    // Set up completion listener for confirm-import
    const confirmPromise = new Promise((resolve, reject) => {
      const onComplete = (j) => {
        if (
          j.data?.importJobId === job._id.toString() &&
          j.name === "confirm-import"
        ) {
          testWorker.off("completed", onComplete);
          resolve(j);
        }
      };
      const onFailed = (j, err) => {
        if (
          j?.data?.importJobId === job._id.toString() &&
          j?.name === "confirm-import"
        ) {
          testWorker.off("failed", onFailed);
          reject(err);
        }
      };
      testWorker.on("completed", onComplete);
      testWorker.on("failed", onFailed);
    });

    // Enqueue confirm job with deterministic jobId
    const confirmEnqueued = await addConfirmJob(job._id.toString());
    assert.ok(
      confirmEnqueued,
      "Confirmation job must be successfully enqueued",
    );
    assert.equal(confirmEnqueued.id, `confirm-${job._id.toString()}`);

    // Wait for worker to process confirmation
    await confirmPromise;

    // Verify completed status and expenses created
    const finalJob = await ImportJob.findById(job._id);
    assert.equal(
      finalJob.status,
      "completed",
      "Final status must be completed",
    );
    assert.ok(finalJob.importedRows > 0, "Imported rows count must be > 0");

    // Verify Expense documents
    const createdExpenses = await Expense.find({ userId: testUserId });
    assert.ok(
      createdExpenses.length > 0,
      "Expense documents must be created in MongoDB",
    );
    assert.equal(
      createdExpenses.length,
      finalJob.importedRows,
      "Number of expenses matches importedRows",
    );

    // Verify ImportedTransaction links
    const finalizedTransactions = await ImportedTransaction.find({
      importJobId: job._id,
      importStatus: "imported",
    });
    assert.equal(
      finalizedTransactions.length,
      finalJob.importedRows,
      "Imported transactions match expense count",
    );
    assert.ok(
      finalizedTransactions.every((t) => t.linkedExpenseId),
      "Every imported txn has linkedExpenseId",
    );
  } finally {
    if (testWorker) {
      await testWorker.close().catch(() => {});
      if (workerRedis) await workerRedis.quit().catch(() => {});
      testWorker = null;
    }
  }
});

test("Integration: Idempotent resume and duplicate prevention on re-confirmation", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  const job = await ImportJob.findOne({
    userId: testUserId,
    status: "completed",
  });
  if (!job) {
    t.skip("No completed job available from previous step");
    return;
  }

  const initialExpenseCount = await Expense.countDocuments({
    userId: testUserId,
  });

  // Re-run confirmImport directly or via worker on the completed job
  const result = await confirmImport(job._id.toString());
  assert.ok(result, "confirmImport must execute idempotently");

  const postExpenseCount = await Expense.countDocuments({ userId: testUserId });
  assert.equal(
    postExpenseCount,
    initialExpenseCount,
    "No duplicate Expense documents created on re-run",
  );
});

test("Integration: Deterministic job IDs allow clean retry of failed BullMQ jobs", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  const queue = getImportQueue();
  assert.ok(queue, "Queue must be accessible");

  const fakeJobId = new mongoose.Types.ObjectId().toString();
  const deterministicId = `confirm-${fakeJobId}`;

  // Add a job and intentionally fail it via worker
  const workerRedis = new IORedis(
    TEST_REDIS_URL,
    getRedisOptions(TEST_REDIS_URL, true),
  );
  let failPromise;
  const failingWorker = new Worker(
    QUEUE_NAME,
    async (j) => {
      if (j.id === deterministicId) {
        throw new Error("Simulated worker crash");
      }
    },
    { connection: workerRedis },
  );
  failingWorker.on("error", () => {});
  failPromise = new Promise((resolve) => {
    failingWorker.on("failed", (j) => {
      if (j.id === deterministicId) resolve();
    });
  });

  await queue.add(
    "confirm-import",
    { importJobId: fakeJobId },
    { jobId: deterministicId, attempts: 1, backoff: null },
  );
  await failPromise;
  await failingWorker.close();
  await workerRedis.quit();

  const failedJob = await queue.getJob(deterministicId);
  assert.ok(failedJob, "Failed job must exist in BullMQ");
  const state = await failedJob.getState();
  assert.equal(state, "failed", "Job is in failed state");

  // Call addConfirmJob with same fakeJobId: it must clean up the failed job and re-enqueue successfully!
  const retriedJob = await addConfirmJob(fakeJobId);
  assert.ok(
    retriedJob,
    "addConfirmJob must re-enqueue despite existing failed job",
  );
  assert.equal(
    retriedJob.id,
    deterministicId,
    "Retried job retains deterministic ID",
  );

  const newState = await retriedJob.getState();
  assert.notEqual(newState, "failed", "Job is active or waiting, not failed");

  // Clean up
  await retriedJob.remove();
});
