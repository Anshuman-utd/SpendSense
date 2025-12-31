import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import AIInsight from '@/models/AIInsight';
import connectDB from '@/lib/db';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const userId = session.user.id;

        // Fetch the latest insight
        const latestInsight = await AIInsight.findOne({ userId }).sort({ createdAt: -1 });

        return NextResponse.json({ success: true, data: latestInsight });

    } catch (error) {
        console.error('Fetch Insights Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch insights' }, { status: 500 });
    }
}
