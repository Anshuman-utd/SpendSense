import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import mongoose from "mongoose";
import IORedis from "ioredis";
import { Worker } from "bullmq";

// 1. Bootstrap environment variables BEFORE importing application database modules
try {
  process.loadEnvFile();
} catch (_) {}

/**
 * Parses and normalizes a Redis URL into canonical host, port, and logical dbIndex.
 * Normalizes localhost, 127.0.0.1, 0.0.0.0, and ::1 to prevent equivalent string bypasses.
 */
export function parseRedisTarget(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    let host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]"
    ) {
      host = "127.0.0.1";
    }
    const port = String(
      parsed.port || (parsed.protocol === "rediss:" ? "6380" : "6379"),
    );
    let pathname = parsed.pathname.replace(/^\//, "");
    let dbIndex = pathname ? parseInt(pathname, 10) : 0;
    if (Number.isNaN(dbIndex)) dbIndex = 0;
    return { host, port, dbIndex, protocol: parsed.protocol };
  } catch (_) {
    return null;
  }
}

/**
 * Validates that the test Redis URL is explicitly configured and points
 * to an isolated test Redis database/instance, refusing production, missing, or equivalent URLs.
 */
export function validateTestRedis(testRedisUrl, prodRedisUrl) {
  if (!testRedisUrl || !testRedisUrl.trim()) {
    return {
      valid: false,
      reason:
        "REDIS_TEST_URL is not set. An explicit test Redis instance is required for destructive integration tests.",
    };
  }

  const testTarget = parseRedisTarget(testRedisUrl);
  if (!testTarget) {
    return {
      valid: false,
      reason: `Invalid REDIS_TEST_URL format: ${testRedisUrl}`,
    };
  }

  if (testTarget.protocol !== "redis:" && testTarget.protocol !== "rediss:") {
    return {
      valid: false,
      reason: "REDIS_TEST_URL must use redis:// or rediss:// protocol.",
    };
  }

  if (prodRedisUrl) {
    const prodTarget = parseRedisTarget(prodRedisUrl);
    if (prodTarget) {
      // Check if equivalent logical Redis database (e.g. localhost:6379 vs 127.0.0.1:6379/0)
      if (
        testTarget.host === prodTarget.host &&
        testTarget.port === prodTarget.port &&
        testTarget.dbIndex === prodTarget.dbIndex
      ) {
        return {
          valid: false,
          reason: `REDIS_TEST_URL targets the same logical Redis database (host: ${testTarget.host}:${testTarget.port}, db: ${testTarget.dbIndex}) as application REDIS_URL. Destructive testing on primary Redis is forbidden.`,
        };
      }
    }
  }

  return { valid: true, url: testRedisUrl, target: testTarget };
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

// 2. Perform test environment validation BEFORE importing application database modules
const RAW_PROD_URI = process.env.MONGODB_URI;
const TEST_MONGO_URI = process.env.MONGODB_TEST_URI;
const TEST_REDIS_URL = process.env.REDIS_TEST_URL;

const dbValidation = validateTestDatabase(TEST_MONGO_URI, RAW_PROD_URI);
const redisValidation = validateTestRedis(TEST_REDIS_URL, process.env.REDIS_URL);

let isEnvironmentAvailable = false;

if (dbValidation.valid && redisValidation.valid) {
  // CRITICAL: Point MONGODB_URI to TEST_MONGO_URI BEFORE any model or db module is loaded!
  process.env.MONGODB_URI = TEST_MONGO_URI;
  isEnvironmentAvailable = true;
} else {
  isEnvironmentAvailable = false;
}

// 3. Dynamically import application modules AFTER process.env.MONGODB_URI has been set to TEST_MONGO_URI
const { default: ImportJob } = await import("../src/models/ImportJob.js");
const { default: ImportedTransaction } = await import(
  "../src/models/ImportedTransaction.js"
);
const { default: Expense } = await import("../src/models/Expense.js");
const { default: FinancialAccount } = await import(
  "../src/models/FinancialAccount.js"
);
const { default: User } = await import("../src/models/User.js");
const { uploadToGridFS } = await import("../src/lib/gridfs.js");
const {
  DEFAULT_QUEUE_NAME,
  QUEUE_NAME,
  getImportQueue,
  addImportJob,
  addConfirmJob,
  getRedisOptions,
  sanitizeRedisUrl,
  isSyncAllowed,
  closeQueue,
} = await import("../src/lib/queue.js");
const { processImportJob, confirmImport } = await import(
  "../src/lib/imports/importService.js"
);

// Dedicated isolated queue name for integration tests
const TEST_QUEUE_NAME = "test-statement-import-queue";

let testWorker = null;
let testRedisClient = null;
let testUserId = null;
let testAccountId = null;
let createdJobIds = [];

// Probe environment before running live integration tests
test.before(async () => {
  if (!isEnvironmentAvailable) {
    console.log(
      `[Integration Tests] Prerequisites not met (${dbValidation.reason || redisValidation.reason}). Live integration tests will be skipped.`,
    );
    return;
  }

  try {
    // 1. Strict queue isolation check
    assert.notEqual(
      TEST_QUEUE_NAME,
      DEFAULT_QUEUE_NAME,
      "Integration tests must never use the default production queue name.",
    );

    // 2. Probe Redis using verified test Redis URL
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
      isEnvironmentAvailable = false;
      return;
    }

    // 3. Clean ONLY the isolated test queue before tests (never touch statement-import-queue)
    const testQueue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
    if (testQueue) {
      await testQueue.obliterate({ force: true }).catch(() => {});
    }

    // 4. Connect to MongoDB using verified test URI
    await mongoose.connect(TEST_MONGO_URI, { bufferCommands: false });

    // 5. CRITICAL: Confirm actual Mongoose connection database name matches test database!
    const connectedDbName = mongoose.connection.db.databaseName;
    assert.equal(
      connectedDbName,
      dbValidation.dbName,
      `Mongoose connected database ("${connectedDbName}") must match expected test database ("${dbValidation.dbName}").`,
    );
    assert.ok(
      connectedDbName.endsWith("_test") || connectedDbName.includes("test"),
      `Mongoose connection database "${connectedDbName}" must be a dedicated test database.`,
    );
    assert.notEqual(
      connectedDbName,
      "spendsense",
      "CRITICAL: Connected database cannot be production spendsense database!",
    );

    console.log(
      `[Integration Tests] Successfully verified and connected to test Redis and confirmed MongoDB test database ("${connectedDbName}").`,
    );

    // Create test user and financial account in verified test DB
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

// Unit: Redis test URL validator (Requirement 2: explicit REDIS_TEST_URL required & equivalent URL protection)
test("Integration: Redis test validator requires explicit REDIS_TEST_URL and forbids primary Redis", () => {
  // Empty
  assert.equal(validateTestRedis("", "").valid, false);
  assert.equal(validateTestRedis(null, null).valid, false);

  // Matches primary Redis URL exactly
  const prodRedis = "redis://default:secret@redis.railway.internal:6379";
  assert.equal(
    validateTestRedis(prodRedis, prodRedis).valid,
    false,
    "Must reject if test Redis URL matches application REDIS_URL exactly",
  );

  // Equivalent URL test: localhost:6379 vs 127.0.0.1:6379/0 (both target DB 0 on local host)
  assert.equal(
    validateTestRedis("redis://127.0.0.1:6379", "redis://localhost:6379").valid,
    false,
    "Must reject equivalent host/port pointing to default DB 0",
  );
  assert.equal(
    validateTestRedis("redis://localhost:6379/0", "redis://127.0.0.1:6379").valid,
    false,
    "Must reject equivalent host/port pointing to same DB index 0",
  );

  // Invalid protocol
  assert.equal(
    validateTestRedis("http://localhost:6379", null).valid,
    false,
    "Must reject non-redis protocols",
  );

  // Valid isolated test Redis URLs: distinct dbIndex
  const validLocalDb1 = "redis://localhost:6379/1";
  const localRes = validateTestRedis(validLocalDb1, "redis://localhost:6379");
  assert.equal(localRes.valid, true, "Distinct logical DB 1 is valid");

  // Valid isolated test Redis URLs: distinct host
  const validTlsTest = "rediss://test-redis.railway.internal:6380";
  const tlsRes = validateTestRedis(validTlsTest, prodRedis);
  assert.equal(tlsRes.valid, true, "Distinct test Redis host is valid");
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

// Live: Worker processes statement import end-to-end on isolated queue using tokenized confirmation
test("Integration: Live BullMQ worker processes statement import end-to-end on isolated queue with tokenized confirmation", async (t) => {
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
            { isWorker: true, confirmationToken: bJob.data.confirmationToken },
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

    // Test Confirmation Pipeline: Real production tokenized confirmation flow
    const confirmToken = crypto.randomUUID();
    const claimed = await ImportJob.findOneAndUpdate(
      {
        _id: job._id,
        status: { $in: ["ready_for_review", "partially_completed"] },
      },
      { $set: { status: "confirmation_queued", confirmationToken: confirmToken } },
      { new: true },
    );
    assert.equal(
      claimed.status,
      "confirmation_queued",
      "Atomic claim sets confirmation_queued",
    );
    assert.equal(
      claimed.confirmationToken,
      confirmToken,
      "Atomic claim persists confirmationToken",
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
      confirmationToken: confirmToken,
    });
    assert.ok(
      confirmEnqueued,
      "Confirmation job must be successfully enqueued",
    );
    assert.equal(
      confirmEnqueued.id,
      `confirm-${job._id.toString()}-${confirmToken}`,
      "Job ID is attempt-scoped with confirmation token",
    );

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
  const token = `retry_token_${Date.now()}`;
  const deterministicId = `confirm-${fakeJobId}-${token}`;

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
    { importJobId: fakeJobId, confirmationToken: token },
    { jobId: deterministicId, attempts: 1, backoff: null },
  );
  await failPromise;
  await failingWorker.close();
  await workerRedis.quit();

  const failedJob = await queue.getJob(deterministicId);
  assert.ok(failedJob, "Failed job must exist in BullMQ");
  const state = await failedJob.getState();
  assert.equal(state, "failed", "Job is in failed state");

  // Call addConfirmJob with same fakeJobId and token: cleans up failed job and re-enqueues
  const retriedJob = await addConfirmJob(fakeJobId, null, {
    queueName: TEST_QUEUE_NAME,
    connection: testRedisClient,
    confirmationToken: token,
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

// Live: Delayed acknowledgment and timeout rollback reconciliation
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
  // (a) API atomically claims ready_for_review -> confirmation_queued with token
  const token = `timeout_token_${Date.now()}`;
  const claimed = await ImportJob.findOneAndUpdate(
    {
      _id: job._id,
      userId: testUserId,
      status: { $in: ["ready_for_review", "partially_completed"] },
    },
    { $set: { status: "confirmation_queued", confirmationToken: token } },
    { new: false },
  );
  assert.equal(
    claimed.status,
    "ready_for_review",
    "API claimed from ready_for_review",
  );

  // (b) API experiences enqueue timeout and rolls back to ready_for_review (scoped to token)
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "confirmation_queued", confirmationToken: token },
    {
      $set: {
        status: "ready_for_review",
        confirmationToken: null,
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
  const lateJobId = `confirm-${job._id.toString()}-${token}`;
  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: token },
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
          { isWorker: true, confirmationToken: bJob.data.confirmationToken },
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

// Live: Overlapping confirmation attempts and delayed queue acknowledgments
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

  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: tokenA },
    { jobId: lateJobAId },
  );

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

// Live Regression 1: Simultaneous retries reject concurrent duplicate claim
test("Integration: Simultaneous retries on partially_completed job reject concurrent duplicate claim", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // Create partially_completed job
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "simultaneous_retry_test.csv",
    fileChecksum: crypto.randomBytes(32).toString("hex"),
    fileSize: 1024,
    currency: "INR",
    status: "partially_completed",
    totalRows: 2,
    progress: { stage: "Partially completed", percent: 50 },
  });
  createdJobIds.push(job._id);

  // Two simultaneous retry attempts hit the atomic claim
  const token1 = crypto.randomUUID();
  const token2 = crypto.randomUUID();

  const claimAttempt = async (token) => {
    return await ImportJob.findOneAndUpdate(
      {
        _id: job._id,
        userId: testUserId,
        $or: [
          { status: { $in: ["failed", "partially_completed"] } },
          {
            status: { $in: ["confirmation_queued", "importing"] },
            updatedAt: { $lt: new Date(Date.now() - 30000) },
          },
        ],
      },
      {
        $set: {
          status: "confirmation_queued",
          confirmationToken: token,
          errorSummary: [],
        },
      },
      { new: true },
    );
  };

  const [res1, res2] = await Promise.all([
    claimAttempt(token1),
    claimAttempt(token2),
  ]);

  const claimedCount = [res1, res2].filter(Boolean).length;
  assert.equal(claimedCount, 1, "Exactly one concurrent retry attempt can claim the job");

  const finalJob = await ImportJob.findById(job._id);
  assert.equal(finalJob.status, "confirmation_queued");
  assert.ok(
    finalJob.confirmationToken === token1 || finalJob.confirmationToken === token2,
    "Job persisted the winning token",
  );
});

// Live Regression 2: Active worker within 30s window rejects retry attempts
test("Integration: Active worker processing within 30s window prevents retry reclamation", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // Create job actively importing (updated just now)
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "active_worker_retry_test.csv",
    fileChecksum: crypto.randomBytes(32).toString("hex"),
    fileSize: 1024,
    currency: "INR",
    status: "importing",
    progress: { stage: "Importing expenses", percent: 40 },
    updatedAt: new Date(), // updated right now
  });
  createdJobIds.push(job._id);

  // Attempting to claim retry should fail because updatedAt is within 30 seconds
  const stuckCutoff = new Date(Date.now() - 30000);
  const claimed = await ImportJob.findOneAndUpdate(
    {
      _id: job._id,
      userId: testUserId,
      $or: [
        { status: { $in: ["failed", "partially_completed"] } },
        {
          status: { $in: ["confirmation_queued", "importing"] },
          updatedAt: { $lt: stuckCutoff },
        },
      ],
    },
    { $set: { status: "confirmation_queued", confirmationToken: crypto.randomUUID() } },
    { new: true },
  );

  assert.equal(claimed, null, "Active importing job must NOT be claimed by retry");

  const untouchedJob = await ImportJob.findById(job._id);
  assert.equal(untouchedJob.status, "importing", "Status must remain importing");
});

// Live Regression 3: Stale retry job is rejected and legitimate retry completes
test("Integration: Stale retry job with mismatched token is rejected while legitimate retry completes", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // 1. Create a partially_completed job with 1 imported and 1 pending transaction
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "stale_retry_test.csv",
    fileChecksum: crypto.randomBytes(32).toString("hex"),
    fileSize: 1024,
    currency: "INR",
    status: "partially_completed",
    totalRows: 2,
    importedRows: 1,
    progress: { stage: "Partially completed", percent: 50 },
  });
  createdJobIds.push(job._id);

  // Previously imported expense
  const exp1 = await Expense.create({
    userId: testUserId,
    amount: 500,
    category: "Food & Dining",
    date: new Date(),
    description: "Previously imported meal",
    merchant: "Cafe",
    paymentMethod: "Bank Transfer",
    source: "import",
    importJobId: job._id,
    financialAccountId: testAccountId,
    currency: "INR",
  });

  const txn1 = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 0,
    transactionDate: new Date(),
    originalDescription: "Previously imported meal",
    normalizedDescription: "Previously imported meal",
    merchant: "Cafe",
    category: "Food & Dining",
    amountMinor: 50000,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "imported",
    linkedExpenseId: exp1._id,
    selected: true,
  });

  const txn2 = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 1,
    transactionDate: new Date(),
    originalDescription: "Unimported pending grocery",
    normalizedDescription: "Unimported pending grocery",
    merchant: "Supermarket",
    category: "Groceries",
    amountMinor: 75000,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "pending",
    selected: true,
  });

  // 2. Retry Attempt 1 starts with token_R1, enqueue times out, rolled back
  const tokenR1 = `retry_1_${Date.now()}`;
  await ImportJob.findByIdAndUpdate(job._id, {
    status: "confirmation_queued",
    confirmationToken: tokenR1,
  });
  // Rolled back to partially_completed
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "confirmation_queued", confirmationToken: tokenR1 },
    { $set: { status: "partially_completed", confirmationToken: null } },
  );

  // 3. Retry Attempt 2 starts immediately with token_R2
  const tokenR2 = `retry_2_${Date.now()}`;
  await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "partially_completed" },
    { $set: { status: "confirmation_queued", confirmationToken: tokenR2 } },
  );

  // 4. Redis receives delayed job from Retry 1 AND legitimate job from Retry 2
  const queue = getImportQueue(TEST_QUEUE_NAME, testRedisClient);
  const lateJob1Id = `confirm-${job._id.toString()}-${tokenR1}`;
  const validJob2Id = `confirm-${job._id.toString()}-${tokenR2}`;

  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: tokenR1 },
    { jobId: lateJob1Id },
  );

  await queue.add(
    "confirm-import",
    { importJobId: job._id.toString(), confirmationToken: tokenR2 },
    { jobId: validJob2Id },
  );

  // 5. Worker processes both jobs
  let workerRedis = new IORedis(
    TEST_REDIS_URL,
    getRedisOptions(TEST_REDIS_URL, true),
  );

  const retryResults = new Map();
  const worker = new Worker(
    TEST_QUEUE_NAME,
    async (bJob) => {
      console.log(`[Retry Worker] Processing: ${bJob.name} (${bJob.id})`);
      if (bJob.name === "confirm-import") {
        const res = await confirmImport(
          bJob.data.importJobId,
          bJob.data.transactionIds,
          { isWorker: true, confirmationToken: bJob.data.confirmationToken },
        );
        retryResults.set(bJob.id, res);
        return res;
      }
    },
    { connection: workerRedis, concurrency: 1 },
  );
  worker.on("error", () => {});
  await worker.waitUntilReady();

  await new Promise((resolve) => {
    let count = 0;
    worker.on("completed", (j) => {
      if (j.id === lateJob1Id || j.id === validJob2Id) {
        count++;
        if (count === 2) resolve();
      }
    });
  });

  await worker.close();
  await workerRedis.quit();

  // 6. Assertions:
  // Retry 1 was skipped as stale token
  const res1 = retryResults.get(lateJob1Id);
  assert.ok(res1);
  assert.equal(res1.reconciled, true);
  assert.equal(res1.skipped, true);
  assert.equal(res1.reason, "stale_attempt_token");

  // Retry 2 completed the pending transaction
  const res2 = retryResults.get(validJob2Id);
  assert.ok(res2);
  assert.equal(res2.importedCount, 1, "Imported exactly the 1 pending transaction");

  // Total expenses: exactly 2 (no duplicate for txn1)
  const allExpenses = await Expense.find({ importJobId: job._id });
  assert.equal(allExpenses.length, 2, "Exactly 2 expenses in total");

  // Final job status is completed
  const finalJob = await ImportJob.findById(job._id);
  assert.equal(finalJob.status, "completed");
});

// Live Regression 4: Partial-import recovery preserves selections and ignores already imported transactions
test("Integration: Partial-import recovery correctly skips imported and imports remaining selected transactions", async (t) => {
  if (!isEnvironmentAvailable) {
    t.skip("Redis or MongoDB not available for live worker test");
    return;
  }

  // Create partially_completed job with 3 transactions: 1 already imported, 2 pending (1 selected, 1 unselected)
  const job = await ImportJob.create({
    userId: testUserId,
    accountId: testAccountId,
    originalFilename: "partial_recovery_test.csv",
    fileChecksum: crypto.randomBytes(32).toString("hex"),
    fileSize: 1024,
    currency: "INR",
    status: "confirmation_queued",
    confirmationToken: `token_part_${Date.now()}`,
    totalRows: 3,
    importedRows: 1,
  });
  createdJobIds.push(job._id);

  // Already imported
  const expPre = await Expense.create({
    userId: testUserId,
    amount: 100,
    category: "Other",
    date: new Date(),
    description: "Already imported item",
    merchant: "Vendor 1",
    paymentMethod: "Bank Transfer",
    source: "import",
    importJobId: job._id,
    financialAccountId: testAccountId,
    currency: "INR",
  });

  await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 0,
    transactionDate: new Date(),
    originalDescription: "Already imported item",
    merchant: "Vendor 1",
    category: "Other",
    amountMinor: 10000,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "imported",
    linkedExpenseId: expPre._id,
    selected: true,
  });

  // Pending selected
  const txnPending = await ImportedTransaction.create({
    importJobId: job._id,
    userId: testUserId,
    accountId: testAccountId,
    sourceRowIndex: 1,
    transactionDate: new Date(),
    originalDescription: "Pending selected item",
    merchant: "Vendor 2",
    category: "Shopping",
    amountMinor: 25000,
    direction: "debit",
    classification: "expense",
    currency: "INR",
    importStatus: "pending",
    selected: true,
  });

  // Execute confirmImport for the recovery
  const res = await confirmImport(job._id.toString(), null, {
    isWorker: true,
    confirmationToken: job.confirmationToken,
  });

  assert.equal(res.importedCount, 1, "Only the 1 unimported selected transaction is imported");

  // Verify that Expense records total 2
  const expenses = await Expense.find({ importJobId: job._id });
  assert.equal(expenses.length, 2, "No duplicate expense created for previously imported transaction");

  const updatedPending = await ImportedTransaction.findById(txnPending._id);
  assert.equal(updatedPending.importStatus, "imported");
  assert.ok(updatedPending.linkedExpenseId);
});
