import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import { processImportJob } from '@/lib/imports/importService';
import { addImportJob } from '@/lib/queue';
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

        if (job.status !== 'failed' && job.status !== 'partially_completed') {
            return NextResponse.json({
                success: false,
                error: `Only failed or partially completed jobs can be retried (current status: ${job.status})`
            }, { status: 400 });
        }

        job.status = 'processing';
        job.progress = { stage: 'Retrying', percent: 5, message: 'Retrying statement processing...' };
        job.errorSummary = [];
        await job.save();

        const url = new URL(req.url);
        const isSyncRequested = url.searchParams.get('sync') === 'true' || 
                                process.env.SYNC_PROCESSING === 'true' || 
                                process.env.ENABLE_SYNC_IMPORT === 'true';

        const queued = await addImportJob(job._id.toString());
        if (!queued) {
            if (isSyncRequested) {
                console.log(`[Retry API] Sync mode active. Processing retry for ${job._id} synchronously...`);
                await processImportJob(job._id.toString());
                const updatedJob = await ImportJob.findById(job._id);
                return NextResponse.json({ success: true, message: 'Retry completed synchronously', data: updatedJob, mode: 'synchronous' });
            } else {
                job.status = 'failed';
                job.progress = {
                    stage: 'Failed',
                    percent: 100,
                    message: 'Background processing queue is unreachable. Please ensure Redis and worker are running.'
                };
                await job.save();

                return NextResponse.json({
                    success: false,
                    error: 'Background processing queue is currently unavailable. Please ensure Redis and worker are running.'
                }, { status: 503 });
            }
        }

        return NextResponse.json({ success: true, message: 'Retry initiated', data: job });

    } catch (error) {
        console.error('Retry import error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to retry import' }, { status: 500 });
    }
}
