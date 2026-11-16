import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import FinancialAccount from '@/models/FinancialAccount';
import { uploadToGridFS } from '@/lib/gridfs';
import { validateCSVFile } from '@/lib/imports/validation';
import { detectColumnMapping } from '@/lib/imports/columnMapper';
import { addImportJob } from '@/lib/queue';
import { processImportJob } from '@/lib/imports/importService';
import { authOptions } from '../../auth/[...nextauth]/route';
import Papa from 'papaparse';

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const formData = await req.formData();
        const file = formData.get('file');
        let accountId = formData.get('accountId');
        const accountName = formData.get('accountName');
        const currency = (formData.get('currency') || 'INR').toUpperCase().trim();

        if (!file) {
            return NextResponse.json({ success: false, error: 'Please select a CSV statement to upload' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 1. File Validation
        const validation = validateCSVFile({
            buffer,
            filename: file.name,
            size: file.size,
            mimetype: file.type
        });

        if (!validation.valid) {
            return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
        }

        // 2. Resolve Financial Account
        if (accountId === 'new' || !accountId) {
            if (!accountName || !accountName.trim()) {
                return NextResponse.json({ success: false, error: 'Please provide an account name' }, { status: 400 });
            }
            const newAcc = await FinancialAccount.create({
                userId: session.user.id,
                accountName: accountName.trim(),
                currency,
                accountType: 'savings'
            });
            accountId = newAcc._id;
        } else {
            if (!mongoose.Types.ObjectId.isValid(accountId)) {
                return NextResponse.json({ success: false, error: 'Invalid account ID provided' }, { status: 400 });
            }
            // Verify ownership of the account
            const account = await FinancialAccount.findOne({ _id: accountId, userId: session.user.id });
            if (!account) {
                return NextResponse.json({ success: false, error: 'Selected account not found or access denied' }, { status: 404 });
            }
        }

        // 3. Compute Cryptographic Checksum (SHA-256)
        const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

        // 4. File-level duplicate detection
        const existingJob = await ImportJob.findOne({
            userId: session.user.id,
            accountId,
            fileChecksum,
            status: { $nin: ['failed', 'cancelled'] }
        });

        if (existingJob) {
            return NextResponse.json({
                success: true,
                duplicateFile: true,
                existingJobId: existingJob._id,
                message: `This exact file was already uploaded on ${new Date(existingJob.createdAt).toLocaleDateString()}. You can view the existing import record.`
            });
        }

        // 5. Store raw file in MongoDB GridFS (Proper file staging - Rule #3)
        const gridFSFileId = await uploadToGridFS({
            buffer,
            filename: file.name,
            contentType: 'text/csv',
            metadata: {
                userId: session.user.id,
                accountId,
                checksum: fileChecksum
            }
        });

        // 6. Inspect header structure to determine initial status
        const textSample = buffer.slice(0, 8192).toString('utf8');
        const parsedSample = Papa.parse(textSample, { preview: 4, header: true, skipEmptyLines: true });
        const headers = parsedSample.meta?.fields || [];
        const detection = detectColumnMapping(headers);

        let initialStatus = 'uploaded';
        let selectedMapping = null;

        if (detection.confidence >= 1.0 && detection.unmappedRequired.length === 0) {
            initialStatus = 'processing';
            selectedMapping = detection.mapping;
        } else {
            initialStatus = 'mapping_required';
        }

        // 7. Create ImportJob document
        const job = await ImportJob.create({
            userId: session.user.id,
            accountId,
            originalFilename: file.name,
            fileChecksum,
            fileSize: file.size,
            gridFSFileId,
            currency,
            status: initialStatus,
            selectedMapping,
            detectedFormat: {
                headers,
                detectedMapping: detection.mapping,
                confidence: detection.confidence,
                sampleRows: parsedSample.data || []
            },
            progress: {
                stage: initialStatus === 'processing' ? 'Queued for processing' : 'Column mapping required',
                percent: initialStatus === 'processing' ? 5 : 0,
                message: initialStatus === 'processing' ? 'Statement uploaded. Processing started...' : 'Please map columns to continue.'
            }
        });

        // 8. Trigger background job
        if (initialStatus === 'processing') {
            const url = new URL(req.url);
            const isSyncRequested = url.searchParams.get('sync') === 'true' || 
                                    process.env.SYNC_PROCESSING === 'true' || 
                                    process.env.ENABLE_SYNC_IMPORT === 'true';

            const queued = await addImportJob(job._id.toString());
            if (!queued) {
                if (isSyncRequested) {
                    // Safe synchronous execution for development and test suites
                    console.log(`[Upload API] Redis queue offline/sync requested. Processing job ${job._id} synchronously...`);
                    await processImportJob(job._id.toString());
                    const updatedJob = await ImportJob.findById(job._id);
                    return NextResponse.json({
                        success: true,
                        data: updatedJob,
                        mode: 'synchronous'
                    }, { status: 201 });
                } else {
                    // In production without Redis: mark failed and return 503 instead of silent termination
                    job.status = 'failed';
                    job.progress = {
                        stage: 'Failed',
                        percent: 100,
                        message: 'Background processing queue is currently unreachable. Please ensure Redis and worker are running.'
                    };
                    job.errorSummary = ['Redis / BullMQ worker service is unreachable.'];
                    await job.save();

                    return NextResponse.json({
                        success: false,
                        error: 'Background processing queue is currently unavailable. Please ensure Redis and worker services are running, or enable SYNC_PROCESSING=true in development.',
                        jobId: job._id
                    }, { status: 503 });
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: job
        }, { status: 201 });

    } catch (error) {
        console.error('Statement upload error:', error);
        return NextResponse.json({ success: false, error: error.message || 'File upload failed' }, { status: 500 });
    }
}
