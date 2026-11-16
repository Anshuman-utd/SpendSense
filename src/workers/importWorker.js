// Load environment variables if running in local development without pre-injected env
if (!process.env.MONGODB_URI || !process.env.REDIS_URL) {
  try {
    process.loadEnvFile();
  } catch (_) {
    // In production (Railway, Docker), env vars are injected at runtime
  }
}

import { Worker } from "bullmq";
import IORedis from "ioredis";
import dbConnect from "../lib/db.js";
import { QUEUE_NAME, sanitizeRedisUrl, getRedisOptions } from "../lib/queue.js";
import {
  processImportJob,
  confirmImport,
} from "../lib/imports/importService.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

console.log("--------------------------------------------------");
console.log(" SpendSense — Smart Statement Ingestion Worker");
console.log("--------------------------------------------------");
console.log(`[Worker] Connecting to Redis at: ${sanitizeRedisUrl(REDIS_URL)}`);

// Worker Redis client: long-running reconnection, maxRetriesPerRequest: null, TLS-aware
const redisOptions = getRedisOptions(REDIS_URL, true);
const redisConnection = new IORedis(REDIS_URL, redisOptions);

redisConnection.on("connect", () => {
  console.log("[Worker] Connected to Redis successfully.");
});

redisConnection.on("error", (err) => {
  // Sanitize any accidental credentials in error messages
  const safeMsg = (err.message || "").replace(
    /redis:\/\/[^@]+@/,
    "redis://***:***@",
  );
  console.error("[Worker] Redis connection error:", safeMsg);
});

// Connect to MongoDB
await dbConnect();
console.log("[Worker] Connected to MongoDB database.");

// Initialize BullMQ Worker
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[Worker] Starting job "${job.name}" (ID: ${job.id})`);

    if (job.name === "process-import") {
      const { importJobId } = job.data;
      if (!importJobId) throw new Error("Missing importJobId in job payload");
      return await processImportJob(importJobId);
    }

    if (job.name === "confirm-import") {
      const { importJobId, transactionIds } = job.data;
      if (!importJobId) throw new Error("Missing importJobId in job payload");
      return await confirmImport(importJobId, transactionIds);
    }

    throw new Error(`Unknown job type: "${job.name}"`);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(
    `[Worker] Job "${job.name}" (ID: ${job.id}) completed successfully.`,
  );
});

worker.on("failed", (job, err) => {
  const safeMsg = (err?.message || "").replace(
    /redis:\/\/[^@]+@/,
    "redis://***:***@",
  );
  console.error(
    `[Worker] Job "${job?.name}" (ID: ${job?.id}) failed:`,
    safeMsg,
  );
});

worker.on("error", (err) => {
  console.error("[Worker] Unhandled worker error:", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("[Worker] Uncaught exception:", err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Worker] Unhandled rejection:", reason);
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(
    `\n[Worker] Received ${signal}. Shutting down worker gracefully...`,
  );
  try {
    await worker.close();
    await redisConnection.quit();
    console.log("[Worker] Worker stopped.");
    process.exit(0);
  } catch (err) {
    console.error("[Worker] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(
  `[Worker] Worker is active and listening on queue "${QUEUE_NAME}".\n`,
);
