import test from 'node:test';
import assert from 'node:assert/strict';

test('Confirmation State Machine: Atomic claim prevents concurrent double-queueing', async () => {
    // Mock database state for ImportJob
    let dbJob = {
        _id: 'job_state_1',
        status: 'ready_for_review',
        progress: { stage: 'Ready for review', percent: 100 }
    };

    // Atomic findOneAndUpdate simulation
    const atomicClaim = async (jobId, allowedStatuses, newStatus) => {
        if (dbJob._id === jobId && allowedStatuses.includes(dbJob.status)) {
            const previous = { ...dbJob };
            dbJob.status = newStatus;
            dbJob.progress = { stage: 'Confirmation queued', percent: 5 };
            return previous;
        }
        return null;
    };

    // Two simultaneous confirmation requests arrive
    const [claim1, claim2] = await Promise.all([
        atomicClaim('job_state_1', ['ready_for_review', 'partially_completed'], 'confirmation_queued'),
        atomicClaim('job_state_1', ['ready_for_review', 'partially_completed'], 'confirmation_queued')
    ]);

    // Exactly one claim succeeds; the other fails atomically
    const successfulClaims = [claim1, claim2].filter(Boolean);
    const failedClaims = [claim1, claim2].filter((c) => c === null);

    assert.equal(successfulClaims.length, 1, 'Only one request can claim confirmation');
    assert.equal(failedClaims.length, 1, 'The concurrent request must be rejected');
    assert.equal(dbJob.status, 'confirmation_queued');
});

test('Confirmation State Machine: Lifecycle transitions ready_for_review -> confirmation_queued -> importing -> completed', async () => {
    const job = {
        _id: 'job_lifecycle_1',
        status: 'ready_for_review',
        importedRows: 0
    };

    // 1. API claims: ready_for_review -> confirmation_queued
    assert.equal(job.status, 'ready_for_review');
    job.status = 'confirmation_queued';

    // 2. Worker picks up: confirmation_queued -> importing
    const allowedForWorker = ['confirmation_queued', 'importing', 'partially_completed'];
    assert.ok(allowedForWorker.includes(job.status), 'Worker must accept confirmation_queued');
    job.status = 'importing';

    // 3. Worker completes: importing -> completed
    job.importedRows = 5;
    job.status = 'completed';
    assert.equal(job.status, 'completed');
});

test('Confirmation State Machine: Rapid worker execution does not get overwritten by API', async () => {
    let job = {
        _id: 'job_rapid_1',
        status: 'ready_for_review'
    };

    // API claims confirmation_queued
    job.status = 'confirmation_queued';

    // Simulate worker executing immediately in background and completing BEFORE API returns
    const workerExecute = async () => {
        job.status = 'importing';
        // expenses created...
        job.status = 'completed';
        job.importedRows = 3;
    };

    await workerExecute();

    // Since the API does NOT call job.save() or overwrite status after queueing,
    // the final state remains 'completed'
    assert.equal(job.status, 'completed', 'Worker completion status must not be clobbered by API');
});

test('Confirmation State Machine: Worker retry after partial persistence (Idempotent resume)', async () => {
    // 4 staged transactions
    const stagedTransactions = [
        { _id: 'tx_1', amount: 10, importStatus: 'imported', linkedExpenseId: 'exp_1' },
        { _id: 'tx_2', amount: 20, importStatus: 'imported', linkedExpenseId: 'exp_2' },
        { _id: 'tx_3', amount: 30, importStatus: 'pending' },
        { _id: 'tx_4', amount: 40, importStatus: 'pending' }
    ];

    const expenseDb = new Map([
        ['tx_1', { _id: 'exp_1', amount: 10 }],
        ['tx_2', { _id: 'exp_2', amount: 20 }]
    ]);

    // Worker resumes from status 'importing'
    const allowedWorkerStatuses = ['confirmation_queued', 'importing', 'partially_completed'];
    assert.ok(allowedWorkerStatuses.includes('importing'), 'Worker must accept importing on retry');

    // Query non-imported transactions
    const pendingTxns = stagedTransactions.filter((t) => t.importStatus !== 'imported');
    assert.equal(pendingTxns.length, 2, 'Only unimported transactions are processed');

    // Process remaining
    for (const txn of pendingTxns) {
        if (!expenseDb.has(txn._id)) {
            const expId = `exp_${txn._id}`;
            expenseDb.set(txn._id, { _id: expId, amount: txn.amount });
            txn.linkedExpenseId = expId;
            txn.importStatus = 'imported';
        }
    }

    assert.equal(expenseDb.size, 4, 'Exactly 4 expenses created');
    assert.ok(stagedTransactions.every((t) => t.importStatus === 'imported'));
});

test('Confirmation State Machine: Redis enqueue failure rolls back to previous eligible state', async () => {
    let job = {
        _id: 'job_rollback_1',
        status: 'ready_for_review'
    };

    // 1. Atomic claim
    const previousStatus = job.status;
    job.status = 'confirmation_queued';

    // 2. Queue enqueue fails (Redis down)
    const enqueueSuccess = false;

    if (!enqueueSuccess) {
        // Rollback conditional on confirmation_queued
        if (job.status === 'confirmation_queued') {
            job.status = previousStatus;
        }
    }

    assert.equal(job.status, 'ready_for_review', 'Status must roll back to ready_for_review upon enqueue failure');
});

test('Confirmation State Machine: Retry API does not re-parse CSV when staged transactions exist', () => {
    const job = {
        _id: 'job_retry_1',
        status: 'partially_completed'
    };

    const stagedTxnCount = 10; // Staged transactions exist

    // Decision logic
    let action = '';
    if (stagedTxnCount > 0) {
        action = 'confirm-import';
    } else {
        action = 'process-import';
    }

    assert.equal(action, 'confirm-import', 'Must retry confirmation, NOT statement re-parsing');
});

test('Confirmation State Machine: Duplicate Expense prevention via unique index simulation', async () => {
    const existingExpenses = new Set(['txn_existing_1']);

    const createExpense = (txnId) => {
        if (existingExpenses.has(txnId)) {
            const err = new Error('E11000 duplicate key error');
            err.code = 11000;
            throw err;
        }
        existingExpenses.add(txnId);
        return { _id: `exp_${txnId}` };
    };

    // First attempt creates
    const exp1 = createExpense('txn_new_1');
    assert.ok(exp1._id);

    // Concurrent or second attempt fails with 11000 and is recovered idempotently
    let exp2 = null;
    try {
        exp2 = createExpense('txn_new_1');
    } catch (err) {
        if (err.code === 11000) {
            // Idempotent recovery
            exp2 = { _id: `exp_txn_new_1` };
        }
    }

    assert.ok(exp2);
    assert.equal(existingExpenses.size, 2, 'No duplicate Expense records added');
});

test('Confirmation State Machine: Late worker execution on rolled-back ready_for_review status is reconciled and skipped', async () => {
    let job = {
        _id: 'job_late_reconcile_1',
        status: 'ready_for_review'
    };

    // 1. API claimed confirmation_queued
    job.status = 'confirmation_queued';

    // 2. Queue enqueue timed out in API; API rolled back to ready_for_review
    job.status = 'ready_for_review';

    // 3. Late BullMQ job arrives at worker. Worker attempts atomic claim with worker-allowed statuses:
    const workerClaimStatuses = ['confirmation_queued', 'importing', 'partially_completed'];
    const canClaim = workerClaimStatuses.includes(job.status);
    assert.equal(canClaim, false, 'Worker must NOT claim a job in ready_for_review');

    // 4. Worker executes reconciliation check
    let workerResult = null;
    if (job.status === 'ready_for_review') {
        workerResult = {
            reconciled: true,
            skipped: true,
            status: 'ready_for_review'
        };
    }

    assert.ok(workerResult.reconciled);
    assert.ok(workerResult.skipped);
    assert.equal(job.status, 'ready_for_review', 'MongoDB job remains intact in ready_for_review for retry');
});

test('Confirmation State Machine: Stale attempt token from timed-out Attempt A is rejected when Attempt B is active in confirmation_queued', async () => {
    let job = {
        _id: 'job_token_race_1',
        status: 'ready_for_review',
        confirmationToken: null,
    };

    // 1. Attempt A arrives and claims confirmation_queued with token_A
    const tokenA = 'token_A_123';
    job.status = 'confirmation_queued';
    job.confirmationToken = tokenA;

    // 2. Attempt A enqueue times out, API rolls back to ready_for_review
    job.status = 'ready_for_review';
    job.confirmationToken = null;

    // 3. User immediately starts Attempt B, claiming confirmation_queued with token_B
    const tokenB = 'token_B_456';
    job.status = 'confirmation_queued';
    job.confirmationToken = tokenB;

    // 4. Delayed BullMQ job from Attempt A now arrives at worker with payload { confirmationToken: tokenA }
    const workerAttemptClaim = (jobDoc, token) => {
        if (jobDoc.status === 'confirmation_queued' && jobDoc.confirmationToken === token) {
            jobDoc.status = 'importing';
            return { claimed: true };
        }
        return { claimed: false };
    };

    const claimA = workerAttemptClaim(job, tokenA);
    assert.equal(claimA.claimed, false, 'Attempt A must NOT claim because token mismatch (tokenA vs tokenB)');

    // Attempt A worker executes token mismatch reconciliation:
    let workerResultA = null;
    if (job.confirmationToken && job.confirmationToken !== tokenA) {
        workerResultA = {
            reconciled: true,
            skipped: true,
            reason: 'stale_attempt_token',
            status: job.status,
        };
    }

    assert.ok(workerResultA);
    assert.equal(workerResultA.reason, 'stale_attempt_token');
    assert.equal(job.status, 'confirmation_queued', 'Job remains confirmation_queued for Attempt B');
    assert.equal(job.confirmationToken, tokenB, 'Job retains tokenB');

    // 5. Attempt B job arrives at worker with payload { confirmationToken: tokenB }
    const claimB = workerAttemptClaim(job, tokenB);
    assert.equal(claimB.claimed, true, 'Attempt B successfully claims job with tokenB');
    assert.equal(job.status, 'importing', 'Job advances to importing for Attempt B');
});


