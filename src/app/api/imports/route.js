import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import ImportJob from '@/models/ImportJob';
import FinancialAccount from '@/models/FinancialAccount'; // ensure model registered
import { authOptions } from '../auth/[...nextauth]/route';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { searchParams } = new URL(req.url);

        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = Math.min(50, parseInt(searchParams.get('limit') || '10', 10));
        const status = searchParams.get('status');

        const query = { userId: session.user.id };
        if (status) {
            query.status = status;
        }

        const skip = (page - 1) * limit;

        const [jobs, total] = await Promise.all([
            ImportJob.find(query)
                .populate('accountId', 'accountName institutionName accountType currency')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ImportJob.countDocuments(query)
        ]);

        return NextResponse.json({
            success: true,
            data: jobs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error('Fetch imports error:', error);
        return NextResponse.json({ success: false, error: 'Failed to retrieve import jobs' }, { status: 500 });
    }
}
