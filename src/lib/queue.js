import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * Centralized BullMQ queue setup for SpendSense
 * Supports production background worker and bounded API producer connections.
 */

export const QUEUE_NAME = "statement-import-queue";

/**
 * Sanitize Redis URL for safe logging (removes credentials)
 */
export function sanitizeRedisUrl(rawUrl) {
  if (!rawUrl) return "undefined";
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol;
    const host = parsed.hostname;
    const port = parsed.port || (protocol === "rediss:" ? "6380" : "6379");
    const auth = parsed.username || parsed.password ? "***:***@" : "";
    return `${protocol}//${auth}${host}:${port}${parsed.pathname}`;
  } catch {
    return "[sanitized-redis-url]";
  }
}

/**
 * Parse Redis configuration options from URL.
 * Handles TLS (rediss://) and separation of producer vs worker settings.
 */
export function getRedisOptions(
  rawUrl = process.env.REDIS_URL,
  isWorker = false,
) {
  const url = rawUrl || "redis://localhost:6379";
  const isTls = url.startsWith("rediss://");

  if (isWorker) {
    // Worker configuration: persistent connection, indefinite reconnect
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 1000, 10000);
      },
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    };
  }

  // Producer / API configuration: bounded retries, connect timeouts, fails fast
  return {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) {
        // Abort reconnecting after 3 attempts to stay within HTTP request budget
        return null;
      }
      return Math.min(times * 300, 1000);
    },
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
  };
}

/**
 * Checks if synchronous execution is allowed.
 * STRICT: Synchronous mode is NEVER permitted in production!
 */
export function isSyncAllowed(req) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (!req) {
    return (
      process.env.SYNC_PROCESSING === "true" ||
      process.env.ENABLE_SYNC_IMPORT === "true"
    );
  }
  try {
    const url = new URL(req.url);
    return (
      url.searchParams.get("sync") === "true" ||
      process.env.SYNC_PROCESSING === "true" ||
      process.env.ENABLE_SYNC_IMPORT === "true"
    );
  } catch {
    return (
      process.env.SYNC_PROCESSING === "true" ||
      process.env.ENABLE_SYNC_IMPORT === "true"
    );
  }
}

let importQueue = null;
let producerRedisConnection = null;

export function getProducerRedisConnection() {
  if (!producerRedisConnection && process.env.REDIS_URL) {
    const url = process.env.REDIS_URL;
    const options = getRedisOptions(url, false);
    try {
      producerRedisConnection = new IORedis(url, options);
      producerRedisConnection.on("error", (err) => {
        // Quietly log to avoid crashing serverless functions
        console.warn("[Queue] Producer Redis warning:", err.message);
      });
    } catch (err) {
      console.warn("[Queue] Failed to initialize Redis client:", err.message);
    }
  }
  return producerRedisConnection;
}

export function getImportQueue() {
  if (!importQueue && process.env.REDIS_URL) {
    const connection = getProducerRedisConnection();
    if (connection) {
      try {
        importQueue = new Queue(QUEUE_NAME, {
          connection,
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 3000,
            },
            removeOnComplete: 100,
            removeOnFail: 50,
          },
        });
      } catch (err) {
        console.warn("[Queue] Could not create BullMQ Queue:", err.message);
      }
    }
  }
  return importQueue;
}

/**
 * Check if Redis queue is healthy and reachable within a strict timeout budget.
 */
export async function isQueueAvailable() {
  if (!process.env.REDIS_URL) return false;
  try {
    const conn = getProducerRedisConnection();
    if (!conn) return false;
    if (conn.status === "ready") {
      const pong = await Promise.race([
        conn.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Ping timeout")), 2000),
        ),
      ]);
      return pong === "PONG";
    }
    if (conn.status === "connecting" || conn.status === "reconnecting") {
      return false;
    }
    if (conn.status === "wait") {
      await Promise.race([
        conn.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connect timeout")), 2500),
        ),
      ]);
      return conn.status === "ready";
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Enqueue a statement processing job with deterministic jobId.
 * Handles previously failed/completed jobs and bounded timeout.
 */
export async function addImportJob(importJobId) {
  const queue = getImportQueue();
  if (!queue) return null;
  try {
    const jobId = `process-${importJobId}`;
    const existingJob = await Promise.race([
      queue.getJob(jobId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("getJob timeout")), 2500),
      ),
    ]).catch(() => null);

    if (existingJob) {
      const state = await existingJob.getState().catch(() => "unknown");
      if (state === "failed" || state === "completed") {
        await existingJob.remove().catch(() => {});
      } else if (
        state === "active" ||
        state === "waiting" ||
        state === "delayed"
      ) {
        return existingJob;
      }
    }

    return await Promise.race([
      queue.add("process-import", { importJobId }, { jobId }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Queue add timeout")), 4000),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[Queue] Failed to enqueue process-import for ${importJobId}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Enqueue an import confirmation job with deterministic jobId.
 * Handles previously failed/completed jobs and bounded timeout.
 */
export async function addConfirmJob(importJobId, transactionIds = null) {
  const queue = getImportQueue();
  if (!queue) return null;
  try {
    const jobId = `confirm-${importJobId}`;
    const existingJob = await Promise.race([
      queue.getJob(jobId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("getJob timeout")), 2500),
      ),
    ]).catch(() => null);

    if (existingJob) {
      const state = await existingJob.getState().catch(() => "unknown");
      if (state === "failed" || state === "completed") {
        await existingJob.remove().catch(() => {});
      } else if (
        state === "active" ||
        state === "waiting" ||
        state === "delayed"
      ) {
        return existingJob;
      }
    }

    return await Promise.race([
      queue.add("confirm-import", { importJobId, transactionIds }, { jobId }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Queue add timeout")), 4000),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[Queue] Failed to enqueue confirm-import for ${importJobId}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Close queue and producer Redis connections gracefully.
 */
export async function closeQueue() {
  if (importQueue) {
    try {
      await importQueue.close();
    } catch (_) {}
    importQueue = null;
  }
  if (producerRedisConnection) {
    try {
      await producerRedisConnection.quit();
    } catch (_) {}
    producerRedisConnection = null;
  }
}
