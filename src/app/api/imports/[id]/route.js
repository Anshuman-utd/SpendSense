import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import ImportedTransaction from '@/models/ImportedTransaction';
import FinancialAccount from '@/models/FinancialAccount'; // ensure registered
import { deleteFromGridFS } from '@/lib/gridfs';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET(req, { params }) {
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

        const job = await ImportJob.findOne({
            _id: id,
            userId: session.user.id
        }).populate('accountId', 'accountName institutionName accountType currency');

        if (!job) {
            return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: job });

    } catch (error) {
        console.error('Fetch import job error:', error);
        return NextResponse.json({ success: false, error: 'Failed to retrieve import job' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
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

        const job = await ImportJob.findOne({
            _id: id,
            userId: session.user.id
        });

        if (!job) {
            return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
        }

        // Clean up staged transactions
        await ImportedTransaction.deleteMany({ importJobId: job._id });

        // Clean up GridFS file if still present
        if (job.gridFSFileId) {
            await deleteFromGridFS(job.gridFSFileId).catch(() => {});
        }

        job.status = 'cancelled';
        job.progress = { stage: 'Cancelled', percent: 100, message: 'Import cancelled by user.' };
        await job.save();

        return NextResponse.json({ success: true, message: 'Import job cancelled and cleaned up.' });

    } catch (error) {
        console.error('Cancel import job error:', error);
        return NextResponse.json({ success: false, error: 'Failed to cancel import job' }, { status: 500 });
    }
}
