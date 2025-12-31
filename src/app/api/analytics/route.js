import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import Expense from '@/models/Expense';
import { authOptions } from '../auth/[...nextauth]/route';
import mongoose from 'mongoose';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const userId = new mongoose.Types.ObjectId(session.user.id);

        const { searchParams } = new URL(req.url);
        // Default to current month if not specified
        const now = new Date();
        const year = parseInt(searchParams.get('year') || now.getFullYear());
        const month = parseInt(searchParams.get('month') || now.getMonth());

        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

        // 1. Total Spending
        const totalSpendingPipeline = [
            {
                $match: {
                    userId: userId,
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$amount' }
                }
            }
        ];

        // 2. Category Wise Spending
        const categorySpendingPipeline = [
            {
                $match: {
                    userId: userId,
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' }
                }
            },
            { $sort: { total: -1 } }
        ];

        // 3. Daily Spending Trend
        const dailySpendingPipeline = [
            {
                $match: {
                    userId: userId,
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: { $dayOfMonth: '$date' },
                    total: { $sum: '$amount' }
                }
            },
            { $sort: { _id: 1 } }
        ];

        // Last Month Pipeline
        const lastMonthStart = new Date(year, month - 1, 1); // Corrected month calculation for last month
        const lastMonthEnd = new Date(year, month, 0, 23, 59, 59); // Corrected month calculation for last month

        const lastMonthTotalPipeline = [
            { $match: { userId: userId, date: { $gte: lastMonthStart, $lte: lastMonthEnd } } }, // Used existing userId
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ];

        // 4. Top Merchants
        const topMerchantsPipeline = [
            {
                $match: {
                    userId: userId,
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$merchant',
                    total: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 3 }
        ];

        // 5. Last Month Category Spending (for comparison)
        const lastMonthCategoryPipeline = [
            {
                $match: {
                    userId: userId,
                    date: { $gte: lastMonthStart, $lte: lastMonthEnd }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' }
                }
            }
        ];

        const [totalResult, categoryResult, dailyResult, recurringResult, lastMonthResult, topMerchantsResult, lastMonthCategoryResult] = await Promise.all([
            Expense.aggregate(totalSpendingPipeline),
            Expense.aggregate(categorySpendingPipeline),
            Expense.aggregate(dailySpendingPipeline),
            Expense.find({ userId: userId, isRecurring: true }).sort({ date: 1 }).limit(5),
            Expense.aggregate(lastMonthTotalPipeline),
            Expense.aggregate(topMerchantsPipeline),
            Expense.aggregate(lastMonthCategoryPipeline)
        ]);

        const stats = {
            total: totalResult[0]?.total || 0,
            lastMonthTotal: lastMonthResult[0]?.total || 0,
            lastMonthCount: lastMonthResult[0]?.count || 0,
            byCategory: categoryResult.map(item => ({ name: item._id, value: item.total })),
            lastMonthByCategory: lastMonthCategoryResult.map(item => ({ name: item._id, value: item.total })),
            dailyTrend: dailyResult.map(item => ({ day: item._id, amount: item.total })),
            upcomingRecurring: recurringResult,
            topMerchants: topMerchantsResult.map(item => ({
                merchant: item._id || 'Unknown',
                amount: item.total,
                count: item.count
            }))
        };

        return NextResponse.json({ success: true, data: stats });

    } catch (error) {
        console.error('Analytics Error:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
