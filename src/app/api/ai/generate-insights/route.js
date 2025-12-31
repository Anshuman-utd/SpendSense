import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '../../auth/[...nextauth]/route';
import Expense from '@/models/Expense';
import AIInsight from '@/models/AIInsight';
import connectDB from '@/lib/db';

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

        const summaryData = {
            totalSpent,
            topCategory,
            categoryBreakdown: categoryMap,
            transactionCount
        };

        // 3. Send to OpenAI
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const prompt = `
      You are a personal finance advisor.
      Here is the user's spending summary for the last 30 days:

      Total Spent: ${totalSpent}
      Top Category: ${topCategory}
      Category Breakdown: ${JSON.stringify(categoryMap)}
      Transactions: ${transactionCount}

      Tasks:
      1. Identify spending patterns (good or bad).
      2. Explain why spending might be high/low based on the top category.
      3. Give 3 actionable improvement tips.
      4. Keep it simple, practical, and friendly.

      Return a pure JSON object with:
      - summary (string): A short 1-2 sentence overview of their spending.
      - problems (array of strings): 1-2 identified issues or observations.
      - tips (array of strings): 3 actionable tips.
    `;

        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are a helpful financial assistant." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = aiResponse.choices[0].message.content;
        const aiData = JSON.parse(content);

        // 4. Save to DB
        const newInsight = await AIInsight.create({
            userId,
            period: 'monthly',
            data: aiData
        });

        return NextResponse.json({ success: true, data: newInsight });

    } catch (error) {
        console.error('Generate Insights Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to generate insights' }, { status: 500 });
    }
}
