import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import { confirmImport } from '@/lib/imports/importService';
import { addConfirmJob } from '@/lib/queue';
import { authOptions } from '../../../auth/[...nextauth]/route';

export async function POST(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return NextResponse.json({ success: false, error: 'Invalid import job ID' }, { status: 400 });
        }

        await dbConnect();

        const job = await ImportJob.findOne({ _id: id, userId: session.user.id });
        if (!job) {
            return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
        }

        if (job.status !== 'ready_for_review' && job.status !== 'partially_completed') {
            return NextResponse.json({
                success: false,
                error: `Import cannot be confirmed from current status (${job.status})`
            }, { status: 400 });
        }

        let transactionIds = null;
        try {
            const body = await req.json();
            if (body && Array.isArray(body.transactionIds)) {
                transactionIds = body.transactionIds;
            }
        } catch (_) {
            // body is optional
        }

        const url = new URL(req.url);
        const isSyncRequested = url.searchParams.get('sync') === 'true' || 
                                process.env.SYNC_PROCESSING === 'true' || 
                                process.env.ENABLE_SYNC_IMPORT === 'true';

        // Try enqueuing to background worker
        const queued = await addConfirmJob(job._id.toString(), transactionIds);
        if (queued) {
            job.status = 'importing';
            job.progress = { stage: 'Import queued', percent: 10, message: 'Queued for import processing...' };
            await job.save();
            return NextResponse.json({ success: true, message: 'Import queued successfully', data: { queued: true } });
        }

        // If Redis/Worker is offline:
        if (isSyncRequested) {
            const result = await confirmImport(job._id.toString(), transactionIds);
            return NextResponse.json({
                success: true,
                message: 'Import completed successfully',
                data: result,
                mode: 'synchronous'
            });
        } else {
            return NextResponse.json({
                success: false,
                error: 'Background processing queue is currently unavailable. Please ensure Redis and worker are running, or enable SYNC_PROCESSING=true in development.'
            }, { status: 503 });
        }

    } catch (error) {
        console.error('Confirm import error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to confirm import' }, { status: 500 });
    }
}
