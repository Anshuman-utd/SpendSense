import { Queue } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Centralized BullMQ queue setup for SpendSense
 * Supports production background worker and graceful detection of Redis availability.
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const QUEUE_NAME = 'statement-import-queue';

let importQueue = null;
let redisConnection = null;

function getRedisConnection() {
    if (!redisConnection && process.env.REDIS_URL) {
        try {
            redisConnection = new IORedis(REDIS_URL, {
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                lazyConnect: true,
                retryStrategy(times) {
                    // Exponential backoff up to 10 seconds
                    return Math.min(times * 1000, 10000);
                }
            });
            redisConnection.on('error', (err) => {
                // Log quietly so serverless APIs don't crash when Redis isn't reachable
                console.warn('[Queue] Redis connection warning:', err.message);
            });
        } catch (err) {
            console.warn('[Queue] Failed to initialize Redis client:', err.message);
        }
    }
    return redisConnection;
}

export function getImportQueue() {
    if (!importQueue && process.env.REDIS_URL) {
        const connection = getRedisConnection();
        if (connection) {
            try {
                importQueue = new Queue(QUEUE_NAME, {
                    connection,
                    defaultJobOptions: {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 3000
                        },
                        removeOnComplete: 100,
                        removeOnFail: 50
                    }
                });
            } catch (err) {
                console.warn('[Queue] Could not create BullMQ Queue:', err.message);
            }
        }
    }
    return importQueue;
}

/**
 * Check if Redis queue is healthy and reachable.
 */
export async function isQueueAvailable() {
    if (!process.env.REDIS_URL) return false;
    try {
        const conn = getRedisConnection();
        if (!conn) return false;
        if (conn.status === 'ready') return true;
        const res = await Promise.race([
            conn.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 1500))
        ]);
        return res === 'PONG';
    } catch {
        return false;
    }
}

/**
 * Enqueue a statement processing job with deterministic jobId.
 * Returns BullMQ Job or null if queue is unavailable.
 */
export async function addImportJob(importJobId) {
    const queue = getImportQueue();
    if (!queue) return null;
    try {
        const jobId = `process-${importJobId}`;
        return await queue.add('process-import', { importJobId }, { jobId });
    } catch (err) {
        console.warn(`[Queue] Failed to enqueue process-import for ${importJobId}:`, err.message);
        return null;
    }
}

/**
 * Enqueue an import confirmation job with deterministic jobId.
 * Prevents multiple active confirmation jobs for the same ImportJob.
 */
export async function addConfirmJob(importJobId, transactionIds = null) {
    const queue = getImportQueue();
    if (!queue) return null;
    try {
        const jobId = `confirm-${importJobId}`;
        return await queue.add('confirm-import', { importJobId, transactionIds }, { jobId });
    } catch (err) {
        console.warn(`[Queue] Failed to enqueue confirm-import for ${importJobId}:`, err.message);
        return null;
    }
}
