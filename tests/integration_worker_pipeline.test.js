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
import { uploadToGridFS } from "../src/lib/gridfs.js";
import {
  DEFAULT_QUEUE_NAME,
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

// Dedicated isolated queue name for integration tests
const TEST_QUEUE_NAME = "test-statement-import-queue";

// Test Redis database/instance: explicitly required via REDIS_TEST_URL (never derived from REDIS_URL)
const TEST_REDIS_URL = process.env.REDIS_TEST_URL;

// Test MongoDB URI: explicitly required via MONGODB_TEST_URI
const RAW_PROD_URI = process.env.MONGODB_URI;
const TEST_MONGO_URI = process.env.MONGODB_TEST_URI;

/**
 * Validates that the test Redis URL is explicitly configured and points
 * to a dedicated isolated test Redis instance/URL, refusing production or undefined URLs.
 */
export function validateTestRedis(testRedisUrl, prodRedisUrl) {
  if (!testRedisUrl || !testRedisUrl.trim()) {
    return {
      valid: false,
      reason:
        "REDIS_TEST_URL is not set. An explicit test Redis instance is required for destructive integration tests.",
    };
  }

  if (prodRedisUrl && testRedisUrl.trim() === prodRedisUrl.trim()) {
    return {
      valid: false,
      reason:
        "REDIS_TEST_URL must not be identical to application REDIS_URL. Destructive testing on primary Redis is forbidden.",
    };
  }

  try {
    const url = new URL(testRedisUrl);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
      return {
        valid: false,
        reason: "REDIS_TEST_URL must use redis:// or rediss:// protocol.",
      };
    }
    return { valid: true, url: testRedisUrl };
  } catch (err) {
    return {
      valid: false,
      reason: `Invalid REDIS_TEST_URL format: ${err.message}`,
    };
  }
}

/**
 * Validates that the test MongoDB URI is explicitly configured and points
 * to a dedicated isolated test database, refusing production or undefined DBs.
 */
export function validateTestDatabase(testUri, prodUri) {
  if (!testUri || !testUri.trim()) {
    return {
      valid: false,
      reason:
        "MONGODB_TEST_URI is not set. An explicit test database is required for test isolation.",
    };
  }

  if (prodUri && testUri.trim() === prodUri.trim()) {
    return {
      valid: false,
      reason:
        "MONGODB_TEST_URI must not match production MONGODB_URI. Destructive testing is forbidden.",
    };
  }

  try {
    const url = new URL(testUri.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    const dbName = url.pathname.replace(/^\//, "").split("?")[0];
    if (!dbName) {
      return {
        valid: false,
        reason: "MONGODB_TEST_URI does not specify a target database name.",
      };
    }

    const forbiddenNames = [
      "admin",
      "local",
      "config",
      "spendsense",
      "production",
      "prod",
    ];
    if (forbiddenNames.includes(dbName.toLowerCase())) {
      return {
        valid: false,
        reason: `Database name "${dbName}" in MONGODB_TEST_URI is unsafe for testing.`,
      };
    }

    if (
      dbName === "spendsense_test" ||
      dbName.endsWith("_test") ||
      dbName.includes("test")
    ) {
      return { valid: true, dbName };
    }

    return {
      valid: false,
      reason: `Database "${dbName}" is not recognized as a dedicated test database (must include "test" or end with "_test").`,
    };
  } catch (err) {
    return {
      valid: false,
      reason: `Invalid MONGODB_TEST_URI format: ${err.message}`,
    };
  }
}

let isEnvironmentAvailable = false;
let testWorker = null;
let testRedisClient = null;
let testUserId = null;
let testAccountId = null;
let createdJobIds = [];

// Probe environment before running live integration tests
test.before(async () => {
  try {
    // 1. Strict database isolation check: refuse to run if test DB is not verified
    const dbValidation = validateTestDatabase(TEST_MONGO_URI, RAW_PROD_URI);
    if (!dbValidation.valid) {
      console.log(
        `[Integration Tests] Prerequisites not met: ${dbValidation.reason} Live integration tests will be skipped.`,
      );
      isEnvironmentAvailable = false;
      return;
    }

    // 2. Strict Redis isolation check: refuse to run if test Redis is not verified
    const redisValidation = validateTestRedis(TEST_REDIS_URL, process.env.REDIS_URL);
    if (!redisValidation.valid) {
      console.log(
        `[Integration Tests] Prerequisites not met: ${redisValidation.reason} Live integration tests will be skipped.`,
      );
      isEnvironmentAvailable = false;
      return;
    }

    // 3. Strict queue isolation check
    assert.notEqual(
      TEST_QUEUE_NAME,
      DEFAULT_QUEUE_NAME,
      "Integration tests must never use the default production queue name.",
    );

    // 4. Probe Redis using verified test Redis URL
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

    // 5. Clean ONLY the isolated test queue before tests (never touch statement-import-queue)
    const testQueue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
    if (testQueue) {
      await testQueue.obliterate({ force: true }).catch(() => {});
    }

    // 6. Connect to MongoDB using verified test URI
    process.env.MONGODB_URI = TEST_MONGO_URI;
    await mongoose.connect(TEST_MONGO_URI, { bufferCommands: false });
    isEnvironmentAvailable = true;
    console.log(
      `[Integration Tests] Successfully connected to live test Redis and isolated MongoDB test DB ("${dbValidation.dbName}").`,
    );

    // Create test user and financial account in test DB
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
  // Never run destructive cleanup if isolation was not established
  if (isEnvironmentAvailable) {
    try {
      if (testWorker) {
        await testWorker.close();
      }
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
      await closeQueue(TEST_QUEUE_NAME);
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

// Unit: Redis TLS security options
test("Integration: Redis TLS configuration enforces verified certificates and SNI", () => {
  const redissUrl = "rediss://redis-cluster.railway.internal:6380";

  // Worker options
  const workerOpts = getRedisOptions(redissUrl, true);
  assert.ok(workerOpts.tls, "TLS options must be defined for rediss://");
  assert.equal(
    workerOpts.tls.rejectUnauthorized,
    true,
    "rejectUnauthorized must default to true in production",
  );
  assert.equal(
    workerOpts.tls.servername,
    "redis-cluster.railway.internal",
    "SNI servername must match hostname",
  );

  // Producer options
  const producerOpts = getRedisOptions(redissUrl, false);
  assert.ok(producerOpts.tls, "TLS options must be defined for producer rediss://");
  assert.equal(
    producerOpts.tls.rejectUnauthorized,
    true,
    "Producer rejectUnauthorized must default to true",
  );
  assert.equal(
    producerOpts.tls.servername,
    "redis-cluster.railway.internal",
    "Producer SNI servername must match hostname",
  );

  // RFC 6066: IP addresses must not set SNI servername
  const ipRedissUrl = "rediss://127.0.0.1:6380";
  const ipOpts = getRedisOptions(ipRedissUrl, false);
  assert.equal(
    ipOpts.tls.servername,
    undefined,
    "IP address must not set SNI servername per RFC 6066",
  );

  // Custom CA support
  const prevCa = process.env.REDIS_CA_CERT;
  try {
    process.env.REDIS_CA_CERT = "-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----";
    const customCaOpts = getRedisOptions(redissUrl, false);
    assert.deepEqual(
      customCaOpts.tls.ca,
      ["-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----"],
      "Custom CA must be configured when REDIS_CA_CERT is provided",
    );
  } finally {
    if (prevCa) process.env.REDIS_CA_CERT = prevCa;
    else delete process.env.REDIS_CA_CERT;
  }

  // Requirement 1: REDIS_TLS_REJECT_UNAUTHORIZED=false CANNOT disable TLS verification when NODE_ENV=production
  const prevEnv = process.env.NODE_ENV;
  const prevReject = process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
  try {
    process.env.NODE_ENV = "production";
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
    const prodOpts = getRedisOptions(redissUrl, false);
    assert.equal(
      prodOpts.tls.rejectUnauthorized,
      true,
      "CRITICAL: rejectUnauthorized must remain true in production even if REDIS_TLS_REJECT_UNAUTHORIZED=false",
    );

    const prodWorkerOpts = getRedisOptions(redissUrl, true);
    assert.equal(
      prodWorkerOpts.tls.rejectUnauthorized,
      true,
      "Worker rejectUnauthorized must remain true in production",
    );

    // In non-production, REDIS_TLS_REJECT_UNAUTHORIZED=false is respected for local dev/self-signed testing
    process.env.NODE_ENV = "development";
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
    const devOpts = getRedisOptions(redissUrl, false);
    assert.equal(
      devOpts.tls.rejectUnauthorized,
      false,
      "rejectUnauthorized is only disabled in non-production when explicitly configured",
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevReject) process.env.REDIS_TLS_REJECT_UNAUTHORIZED = prevReject;
    else delete process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
  }
});

// Unit: Redis test URL validator (Requirement 2: explicit REDIS_TEST_URL required)
test("Integration: Redis test validator requires explicit REDIS_TEST_URL and forbids primary Redis", () => {
  // Empty
  assert.equal(validateTestRedis("", "").valid, false);
  assert.equal(validateTestRedis(null, null).valid, false);

  // Matches primary Redis URL
  const prodRedis = "redis://default:secret@redis.railway.internal:6379";
  assert.equal(
    validateTestRedis(prodRedis, prodRedis).valid,
    false,
    "Must reject if test Redis URL matches application REDIS_URL",
  );

  // Invalid protocol
  assert.equal(
    validateTestRedis("http://localhost:6379", null).valid,
    false,
    "Must reject non-redis protocols",
  );

  // Valid isolated test Redis URLs
  const validLocalDb1 = "redis://localhost:6379/1";
  const localRes = validateTestRedis(validLocalDb1, "redis://localhost:6379/0");
  assert.equal(localRes.valid, true);

  const validTlsTest = "rediss://test-redis.railway.internal:6380";
  const tlsRes = validateTestRedis(validTlsTest, prodRedis);
  assert.equal(tlsRes.valid, true);
});

// Unit: Database isolation validator
test("Integration: Database validator enforces explicit test DB isolation and refuses production", () => {
  // Empty
  assert.equal(validateTestDatabase("", "").valid, false);
  assert.equal(validateTestDatabase(null, null).valid, false);

  // Matches production URI
  const prod = "mongodb+srv://user:pass@cluster.net/spendsense?appName=SpendSense";
  assert.equal(
    validateTestDatabase(prod, prod).valid,
    false,
    "Must reject if test URI matches prod URI",
  );

  // Unsafe database names
  const unsafeProd = "mongodb://localhost:27017/spendsense";
  assert.equal(validateTestDatabase(unsafeProd, null).valid, false);

  const unsafeAdmin = "mongodb://localhost:27017/admin";
  assert.equal(validateTestDatabase(unsafeAdmin, null).valid, false);

  // Valid isolated test DBs
  const validAtlas = "mongodb+srv://user:pass@cluster.net/spendsense_test?appName=SpendSense";
  const atlasRes = validateTestDatabase(validAtlas, prod);
  assert.equal(atlasRes.valid, true);
  assert.equal(atlasRes.dbName, "spendsense_test");

  const validLocal = "mongodb://localhost:27017/test_app_test";
  const localRes = validateTestDatabase(validLocal, null);
  assert.equal(localRes.valid, true);
  assert.equal(localRes.dbName, "test_app_test");
});

// Unit: Producer and worker Redis options strictly separated and sanitized
test("Integration: Producer and Worker Redis options are strictly separated and sanitized", () => {
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

  const workerOpts = getRedisOptions("redis://localhost:6379", true);
  assert.equal(
    workerOpts.maxRetriesPerRequest,
    null,
    "Worker must allow BullMQ blocking commands",
  );
});

// Unit: Synchronous import overrides strictly disabled in production
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

// Live: Worker processes statement import end-to-end on isolated queue
test("Integration: Live BullMQ worker processes statement import end-to-end on isolated queue", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  let workerRedis = null;
  try {
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

    // Initialize live worker on TEST_QUEUE_NAME
    workerRedis = new IORedis(
      TEST_REDIS_URL,
      getRedisOptions(TEST_REDIS_URL, true),
    );
    testWorker = new Worker(
      TEST_QUEUE_NAME,
      async (bJob) => {
        console.log(
          `[Integration Worker] Received job: ${bJob.name} (${bJob.id})`,
        );
        if (bJob.name === "process-import") {
          return await processImportJob(bJob.data.importJobId, {
            isWorker: true,
          });
        }
        if (bJob.name === "confirm-import") {
          return await confirmImport(
            bJob.data.importJobId,
            bJob.data.transactionIds,
            { isWorker: true },
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
          testWorker.off("completed", onComplete);
          resolve(j);
        }
      };
      const onFailed = (j, err) => {
        if (
          j?.data?.importJobId === job._id.toString() &&
          j?.name === "process-import"
        ) {
          testWorker.off("failed", onFailed);
          reject(err);
        }
      };
      testWorker.on("completed", onComplete);
      testWorker.on("failed", onFailed);
    });

    // Enqueue on TEST_QUEUE_NAME
    const enqueued = await addImportJob(job._id.toString(), {
      queueName: TEST_QUEUE_NAME,
      connection: testRedisClient,
    });
    assert.ok(enqueued, "Job must be successfully enqueued to BullMQ");
    assert.equal(enqueued.id, `process-${job._id.toString()}`);

    await jobCompletedPromise;

    const updatedJob = await ImportJob.findById(job._id);
    assert.equal(
      updatedJob.status,
      "ready_for_review",
      "Job must transition to ready_for_review",
    );
    assert.equal(updatedJob.totalRows, 5, "Must parse exactly 5 rows");

    const staged = await ImportedTransaction.find({ importJobId: job._id });
    assert.equal(
      staged.length,
      5,
      "Must stage exactly 5 ImportedTransaction records",
    );

    // Test Confirmation Pipeline: Atomic claim -> confirmation_queued -> importing -> completed
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

    const confirmEnqueued = await addConfirmJob(job._id.toString(), null, {
      queueName: TEST_QUEUE_NAME,
      connection: testRedisClient,
    });
    assert.ok(
      confirmEnqueued,
      "Confirmation job must be successfully enqueued",
    );
    assert.equal(confirmEnqueued.id, `confirm-${job._id.toString()}`);

    await confirmPromise;

    const finalJob = await ImportJob.findById(job._id);
    assert.equal(
      finalJob.status,
      "completed",
      "Final status must be completed",
    );
    assert.ok(finalJob.importedRows > 0, "Imported rows count must be > 0");

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
  } finally {
    if (testWorker) {
      await testWorker.close().catch(() => {});
      if (workerRedis) await workerRedis.quit().catch(() => {});
      testWorker = null;
    }
  }
});

// Live: Idempotent resume and duplicate prevention on re-confirmation
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

  const result = await confirmImport(job._id.toString(), null, {
    isWorker: true,
  });
  assert.ok(result, "confirmImport must execute idempotently");
  assert.ok(result.alreadyCompleted, "Recognizes already completed job");

  const postExpenseCount = await Expense.countDocuments({ userId: testUserId });
  assert.equal(
    postExpenseCount,
    initialExpenseCount,
    "No duplicate Expense documents created on re-run",
  );
});

// Live: Deterministic job IDs allow clean retry of failed BullMQ jobs
test("Integration: Deterministic job IDs allow clean retry of failed BullMQ jobs on isolated queue", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  const queue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
  assert.ok(queue, "Test queue must be accessible");

  const fakeJobId = new mongoose.Types.ObjectId().toString();
  const deterministicId = `confirm-${fakeJobId}`;

  const workerRedis = new IORedis(
    TEST_REDIS_URL,
    getRedisOptions(TEST_REDIS_URL, true),
  );
  let failPromise;
  const failingWorker = new Worker(
    TEST_QUEUE_NAME,
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

  // Call addConfirmJob with same fakeJobId: must clean up failed job and re-enqueue
  const retriedJob = await addConfirmJob(fakeJobId, null, {
    queueName: TEST_QUEUE_NAME,
    connection: testRedisClient,
  });
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

  await retriedJob.remove();
});

// Live: Delayed acknowledgment and timeout rollback reconciliation (Requirement #4)
test("Integration: Late Redis job after enqueue timeout rollback is safely reconciled without creating expenses", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // 1. Create an ImportJob in ready_for_review with staged ImportedTransaction records
  const fakeChecksum = crypto.randomBytes(32).toString("hex");
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "late_ack_test.csv",
    fileChecksum: fakeChecksum,
    fileSize: 1024,
    currency: "INR",
    status: "ready_for_review",
    totalRows: 2,
    progress: { stage: "Ready for review", percent: 100 },
  });
  createdJobIds.push(job._id);

  // Staged expense transaction
  const txn1 = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 0,
    transactionDate: new Date("2026-11-15"),
    originalDescription: "ZOMATO ONLINE ORDER",
    normalizedDescription: "ZOMATO ONLINE ORDER",
    merchant: "Zomato",
    category: "Food & Dining",
    amountMinor: 49900,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "pending",
    selected: true,
  });

  const initialExpenseCount = await Expense.countDocuments({
    importJobId: job._id,
  });
  assert.equal(initialExpenseCount, 0, "No initial expenses for test job");

  // 2. Simulate API confirm flow:
  // (a) API atomically claims ready_for_review -> confirmation_queued
  const claimed = await ImportJob.findOneAndUpdate(
    {
      _id: job._id,
      userId: testUserId,
      status: { $in: ["ready_for_review", "partially_completed"] },
    },
    { $set: { status: "confirmation_queued" } },
    { new: false },
  );
  assert.equal(
    claimed.status,
    "ready_for_review",
    "API claimed from ready_for_review",
  );

  // (b) API experiences enqueue timeout and rolls back to ready_for_review
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "confirmation_queued" },
    {
      $set: {
        status: "ready_for_review",
        "progress.message": "Enqueue timed out; rolled back.",
      },
    },
  );

  const rolledBackJob = await ImportJob.findById(job._id);
  assert.equal(
    rolledBackJob.status,
    "ready_for_review",
    "Status is rolled back to ready_for_review",
  );

  // 3. Late acknowledgment: the Redis job lands in the queue despite API timeout!
  const queue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
  const lateJobId = `confirm-${job._id.toString()}`;
  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString() },
    { jobId: lateJobId },
  );

  // 4. Worker picks up this late job
  let lateWorkerRedis = new IORedis(
    TEST_REDIS_URL,
    getRedisOptions(TEST_REDIS_URL, true),
  );
  let workerJobResult = null;
  const lateWorker = new Worker(
    TEST_QUEUE_NAME,
    async (bJob) => {
      console.log(
        `[Late Ack Worker] Received late job: ${bJob.name} (${bJob.id})`,
      );
      if (bJob.name === "confirm-import") {
        workerJobResult = await confirmImport(
          bJob.data.importJobId,
          bJob.data.transactionIds,
          { isWorker: true },
        );
        return workerJobResult;
      }
    },
    { connection: lateWorkerRedis, concurrency: 1 },
  );
  lateWorker.on("error", () => {});
  await lateWorker.waitUntilReady();

  const waitComplete = new Promise((resolve) => {
    lateWorker.on("completed", (j) => {
      if (j.id === lateJobId) resolve(j);
    });
  });

  await waitComplete;
  await lateWorker.close();
  await lateWorkerRedis.quit();

  // 5. Verification: Safe Queue-State Reconciliation
  // (a) Worker recognized reconciliation state and safely skipped execution
  assert.ok(workerJobResult, "Worker completed with reconciliation result");
  assert.equal(
    workerJobResult.reconciled,
    true,
    "Worker must flag job as reconciled",
  );
  assert.equal(workerJobResult.skipped, true, "Worker must skip execution");
  assert.equal(
    workerJobResult.status,
    "ready_for_review",
    "Worker detected ready_for_review status",
  );

  // (b) Crucial guarantee: Zero Expense records were created!
  const postExpenses = await Expense.countDocuments({ importJobId: job._id });
  assert.equal(
    postExpenses,
    0,
    "CRITICAL: No expenses must be created by late worker job",
  );

  // (c) Crucial guarantee: MongoDB status was NOT corrupted into importing or completed
  const preservedJob = await ImportJob.findById(job._id);
  assert.equal(
    preservedJob.status,
    "ready_for_review",
    "ImportJob must remain in ready_for_review for legitimate user retry",
  );

  // (d) Staged transaction remains pending
  const preservedTxn = await ImportedTransaction.findById(txn1._id);
  assert.equal(
    preservedTxn.importStatus,
    "pending",
    "Staged transaction status was not modified",
  );
});

// Live: Overlapping confirmation attempts and delayed queue acknowledgments (Requirement #3 & #4)
test("Integration: Overlapping confirmation attempts: delayed Attempt A job is rejected as stale and does not interfere with Attempt B", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // 1. Create an ImportJob in ready_for_review with 2 staged ImportedTransaction records
  const fakeChecksum = crypto.randomBytes(32).toString("hex");
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "overlapping_attempts_test.csv",
    fileChecksum: fakeChecksum,
    fileSize: 2048,
    currency: "INR",
    status: "ready_for_review",
    totalRows: 2,
    progress: { stage: "Ready for review", percent: 100 },
  });
  createdJobIds.push(job._id);

  const txn1 = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 0,
    transactionDate: new Date("2026-11-16"),
    originalDescription: "AMAZON RETAIL INDIA",
    normalizedDescription: "AMAZON RETAIL INDIA",
    merchant: "Amazon",
    category: "Shopping",
    amountMinor: 159900,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "pending",
    selected: true,
  });

  const txn2 = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 1,
    transactionDate: new Date("2026-11-16"),
    originalDescription: "STARBUCKS COFFEE",
    normalizedDescription: "STARBUCKS COFFEE",
    merchant: "Starbucks",
    category: "Food & Dining",
    amountMinor: 38000,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "pending",
    selected: true,
  });

  // 2. ATTEMPT A: User triggers confirmation attempt A
  const tokenA = `token_A_${Date.now()}`;
  await ImportJob.findByIdAndUpdate(job._id, {
    status: "confirmation_queued",
    confirmationToken: tokenA,
  });

  // Attempt A enqueue experiences timeout in API -> API rolls back status
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "confirmation_queued", confirmationToken: tokenA },
    { $set: { status: "ready_for_review", confirmationToken: null } },
  );

  // 3. ATTEMPT B: User triggers confirmation attempt B immediately after
  const tokenB = `token_B_${Date.now()}`;
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: { $in: ["ready_for_review", "partially_completed"] } },
    { $set: { status: "confirmation_queued", confirmationToken: tokenB } },
  );

  // In MongoDB right now, status is 'confirmation_queued' and confirmationToken is tokenB!
  const currentDbJob = await ImportJob.findById(job._id);
  assert.equal(currentDbJob.status, "confirmation_queued");
  assert.equal(currentDbJob.confirmationToken, tokenB);

  // 4. Concurrency race trigger:
  // Attempt A's delayed Redis job now lands in Redis with tokenA!
  // And Attempt B's job also lands in Redis with tokenB!
  const queue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
  const lateJobAId = `confirm-${job._id.toString()}-${tokenA}`;
  const validJobBId = `confirm-${job._id.toString()}-${tokenB}`;

  // Add Attempt A's delayed job first
  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: tokenA },
    { jobId: lateJobAId },
  );

  // Add Attempt B's legitimate job
  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: tokenB },
    { jobId: validJobBId },
  );

  // 5. Start live worker on TEST_QUEUE_NAME to process both jobs sequentially
  let workerRedis = new IORedis(
    TEST_REDIS_URL,
    getRedisOptions(TEST_REDIS_URL, true),
  );

  const jobResults = new Map();
  const worker = new Worker(
    TEST_QUEUE_NAME,
    async (bJob) => {
      console.log(`[Overlapping Worker] Processing: ${bJob.name} (${bJob.id})`);
      if (bJob.name === "confirm-import") {
        const res = await confirmImport(
          bJob.data.importJobId,
          bJob.data.transactionIds,
          { isWorker: true, confirmationToken: bJob.data.confirmationToken },
        );
        jobResults.set(bJob.id, res);
        return res;
      }
    },
    { connection: workerRedis, concurrency: 1 },
  );
  worker.on("error", () => {});
  await worker.waitUntilReady();

  // Wait for both jobs to be processed
  await new Promise((resolve) => {
    let completedCount = 0;
    worker.on("completed", (j) => {
      if (j.id === lateJobAId || j.id === validJobBId) {
        completedCount++;
        if (completedCount === 2) resolve();
      }
    });
  });

  await worker.close();
  await workerRedis.quit();

  // 6. Assertions:
  // (a) Attempt A's delayed job was rejected as stale and skipped without error
  const resA = jobResults.get(lateJobAId);
  assert.ok(resA, "Result for Attempt A must exist");
  assert.equal(resA.reconciled, true, "Attempt A must be flagged as reconciled");
  assert.equal(resA.skipped, true, "Attempt A must be skipped");
  assert.equal(resA.reason, "stale_attempt_token", "Attempt A detected stale attempt token");

  // (b) Attempt B successfully claimed and completed the confirmation
  const resB = jobResults.get(validJobBId);
  assert.ok(resB, "Result for Attempt B must exist");
  assert.equal(resB.importedCount, 2, "Attempt B imported both transactions");

  // (c) MongoDB ImportJob is in 'completed' status
  const finalJob = await ImportJob.findById(job._id);
  assert.equal(finalJob.status, "completed", "Job transitioned to completed");
  assert.equal(finalJob.importedRows, 2, "Exactly 2 rows imported");

  // (d) Exactly 2 Expense records exist in MongoDB (no duplicate writes or interference)
  const createdExpenses = await Expense.find({ importJobId: job._id });
  assert.equal(createdExpenses.length, 2, "Exactly 2 expenses created in total");

  // (e) Both transactions marked imported
  const updatedTxns = await ImportedTransaction.find({ importJobId: job._id });
  assert.ok(updatedTxns.every((t) => t.importStatus === "imported"));
});

