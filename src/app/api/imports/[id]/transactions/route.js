import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import ImportedTransaction from '@/models/ImportedTransaction';
import { authOptions } from '../../../auth/[...nextauth]/route';

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

        // 1. Verify Job Ownership
        const job = await ImportJob.findOne({ _id: id, userId: session.user.id });
        if (!job) {
            return NextResponse.json({ success: false, error: 'Import job not found' }, { status: 404 });
        }

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
        const filter = searchParams.get('filter') || 'all';
        const category = searchParams.get('category');
        const search = searchParams.get('search');

        // 2. Build Query
        const query = {
            importJobId: job._id,
            userId: session.user.id
        };

        if (category && category !== 'all') {
            query.category = category;
        }

        if (filter === 'duplicates') {
            query.duplicateStatus = { $in: ['possible_duplicate', 'confirmed_duplicate'] };
        } else if (filter === 'credits') {
            query.direction = 'credit';
        } else if (filter === 'expenses') {
            query.classification = 'expense';
        } else if (filter === 'selected') {
            query.selected = true;
        } else if (filter === 'invalid') {
            query['validationErrors.0'] = { $exists: true };
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { merchant: regex },
                { normalizedDescription: regex },
                { originalDescription: regex },
                { bankReference: regex }
            ];
        }

        const skip = (page - 1) * limit;

        const [transactions, total, allSelected] = await Promise.all([
            ImportedTransaction.find(query)
                .sort({ sourceRowIndex: 1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ImportedTransaction.countDocuments(query),
            ImportedTransaction.find({ importJobId: job._id, selected: true, classification: 'expense' })
                .select('amountMinor')
                .lean()
        ]);

        const selectedAmountTotal = allSelected.reduce((sum, t) => sum + (t.amountMinor / 100), 0);

        return NextResponse.json({
            success: true,
            data: transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            summary: {
                selectedCount: allSelected.length,
                selectedAmountTotal: Math.round(selectedAmountTotal * 100) / 100
            }
        });

    } catch (error) {
        console.error('Fetch import transactions error:', error);
        return NextResponse.json({ success: false, error: 'Failed to retrieve transactions' }, { status: 500 });
    }
}
