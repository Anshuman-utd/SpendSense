import { Queue } from "bullmq";
import IORedis from "ioredis";
import net from "node:net";

/**
 * Centralized BullMQ queue setup for SpendSense
 * Supports production background worker and bounded API producer connections.
 */

export const DEFAULT_QUEUE_NAME = "statement-import-queue";
export const QUEUE_NAME = process.env.QUEUE_NAME || DEFAULT_QUEUE_NAME;

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
 * Handles verified TLS (rediss://) and separation of producer vs worker settings.
 */
export function getRedisOptions(
  rawUrl = process.env.REDIS_URL,
  isWorker = false,
) {
  const url = rawUrl || "redis://localhost:6379";
  const isTls = url.startsWith("rediss://");

  let tlsOptions = undefined;
  if (isTls) {
    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch (_) {
      hostname = undefined;
    }

    const allowInsecureTls =
      process.env.NODE_ENV !== "production" &&
      process.env.REDIS_TLS_REJECT_UNAUTHORIZED === "false";

    tlsOptions = {
      // Verified TLS certificates enforced in production; rejectUnauthorized cannot be disabled in production
      rejectUnauthorized: !allowInsecureTls,
    };
    // RFC 6066: SNI servername must only be set for domain hostnames, not IP addresses
    if (hostname && !net.isIP(hostname)) {
      tlsOptions.servername = hostname;
    }
    // Only configure custom CA if genuinely provided
    const caCert = process.env.REDIS_CA_CERT || process.env.REDIS_TLS_CA;
    if (caCert) {
      tlsOptions.ca = [caCert];
    }
  }

  if (isWorker) {
    // Worker configuration: persistent connection, indefinite reconnect
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy(times) {
        return Math.min(times * 1000, 10000);
      },
      ...(tlsOptions ? { tls: tlsOptions } : {}),
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
    ...(tlsOptions ? { tls: tlsOptions } : {}),
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

const queues = new Map();
let producerRedisConnection = null;

export function getProducerRedisConnection(redisUrl = process.env.REDIS_URL) {
  if (!producerRedisConnection && redisUrl) {
    const options = getRedisOptions(redisUrl, false);
    try {
      producerRedisConnection = new IORedis(redisUrl, options);
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

export function getImportQueue(queueName = QUEUE_NAME, connection = null) {
  const qName = queueName || QUEUE_NAME;
  if (queues.has(qName)) {
    return queues.get(qName);
  }

  const redisConn = connection || getProducerRedisConnection();
  if (redisConn) {
    try {
      const queue = new Queue(qName, {
        connection: redisConn,
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
      queues.set(qName, queue);
      return queue;
    } catch (err) {
      console.warn(
        `[Queue] Could not create BullMQ Queue (${qName}):`,
        err.message,
      );
    }
  }
  return null;
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
 * Handles previously failed/completed jobs, bounded timeout, and late reconciliation.
 */
export async function addImportJob(importJobId, options = {}) {
  const queueName = options.queueName || QUEUE_NAME;
  const queue = options.queue || getImportQueue(queueName, options.connection);
  if (!queue) return null;
  const timeoutMs = options.timeoutMs || 4000;
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

    let timedOut = false;
    let timeoutTimer = null;
    const addPromise = queue.add("process-import", { importJobId }, { jobId });
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        reject(new Error("Queue add timeout"));
      }, timeoutMs);
    });

    try {
      const job = await Promise.race([addPromise, timeoutPromise]);
      clearTimeout(timeoutTimer);
      return job;
    } catch (raceErr) {
      clearTimeout(timeoutTimer);
      if (timedOut) {
        // Late-acknowledgment reconciliation: cancel orphaned job if it lands
        addPromise
          .then(async (lateJob) => {
            if (lateJob) {
              try {
                const state = await lateJob.getState();
                if (state === "waiting" || state === "delayed") {
                  await lateJob.remove();
                  console.warn(
                    `[Queue] Reconciled late job ${lateJob.id}: removed from ${state} state after timeout.`,
                  );
                }
              } catch (cleanErr) {
                console.warn(
                  `[Queue] Could not clean late job ${lateJob.id}:`,
                  cleanErr.message,
                );
              }
            }
          })
          .catch(() => {});
      }
      throw raceErr;
    }
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
 * Handles previously failed/completed jobs, bounded timeout, and late reconciliation.
 */
export async function addConfirmJob(
  importJobId,
  transactionIds = null,
  options = {},
) {
  const queueName = options.queueName || QUEUE_NAME;
  const queue = options.queue || getImportQueue(queueName, options.connection);
  if (!queue) return null;
  const timeoutMs = options.timeoutMs || 4000;
  const confirmationToken = options.confirmationToken || null;
  try {
    const jobId = confirmationToken
      ? `confirm-${importJobId}-${confirmationToken}`
      : `confirm-${importJobId}`;
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

    let timedOut = false;
    let timeoutTimer = null;
    const addPromise = queue.add(
      "confirm-import",
      { importJobId, transactionIds, confirmationToken },
      { jobId },
    );
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        reject(new Error("Queue add timeout"));
      }, timeoutMs);
    });

    try {
      const job = await Promise.race([addPromise, timeoutPromise]);
      clearTimeout(timeoutTimer);
      return job;
    } catch (raceErr) {
      clearTimeout(timeoutTimer);
      if (timedOut) {
        // Late-acknowledgment reconciliation: cancel orphaned job if it lands
        addPromise
          .then(async (lateJob) => {
            if (lateJob) {
              try {
                const state = await lateJob.getState();
                if (state === "waiting" || state === "delayed") {
                  await lateJob.remove();
                  console.warn(
                    `[Queue] Reconciled late job ${lateJob.id}: removed from ${state} state after timeout.`,
                  );
                }
              } catch (cleanErr) {
                console.warn(
                  `[Queue] Could not clean late job ${lateJob.id}:`,
                  cleanErr.message,
                );
              }
            }
          })
          .catch(() => {});
      }
      throw raceErr;
    }
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
export async function closeQueue(queueName = null) {
  if (queueName) {
    const q = queues.get(queueName);
    if (q) {
      await q.close().catch(() => {});
      queues.delete(queueName);
    }
    return;
  }
  for (const [name, q] of queues.entries()) {
    try {
      await q.close();
    } catch (_) {}
  }
  queues.clear();
  if (producerRedisConnection) {
    try {
      await producerRedisConnection.quit();
    } catch (_) {}
    producerRedisConnection = null;
  }
}

