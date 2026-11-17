import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import Expense from '@/models/Expense';
import AIInsight from '@/models/AIInsight';
import connectDB from '@/lib/db';
import { generateSpendingInsights } from '@/lib/groq';

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();
        const userId = session.user.id;

        // 1. Fetch Expenses (Last 30 days default)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const expenses = await Expense.find({
            userId,
            date: { $gte: startDate, $lte: endDate },
        });

        if (!expenses.length) {
            return NextResponse.json({ error: 'No expenses found to analyze' }, { status: 400 });
        }

        // 2. Summarize Data Locally
        const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
        const transactionCount = expenses.length;

        const categoryMap = {};
        expenses.forEach(e => {
            categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
        });

        // Find top category
        let topCategory = '';
        let maxCatVal = 0;
        for (const [cat, val] of Object.entries(categoryMap)) {
            if (val > maxCatVal) {
                maxCatVal = val;
                topCategory = cat;
            }
        }

        // 3. Send to Groq
        const aiData = await generateSpendingInsights({
            totalSpent,
            topCategory,
            categoryBreakdown: categoryMap,
            transactionCount
        });

        // 4. Save to DB
        const newInsight = await AIInsight.create({
            userId,
            period: 'monthly',
            data: aiData
        });

        return NextResponse.json({ success: true, data: newInsight });

    } catch (error) {
        console.error('Generate Insights Error (Groq):', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to generate insights' }, { status: 500 });
    }
}
