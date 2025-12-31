import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import Expense from '@/models/Expense';
import { authOptions } from '../auth/[...nextauth]/route';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        // Basic filtering support
        const { searchParams } = new URL(req.url);
        const category = searchParams.get('category');
        const month = searchParams.get('month'); // Format: YYYY-MM

        let query = { userId: session.user.id };

        if (category) {
            query.category = category;
        }

        if (month) {
            const [year, monthVal] = month.split('-').map(Number);
            // Create dates in local time (or consistently) to capture the full day
            // Start of month: 1st day at 00:00:00
            const start = new Date(year, monthVal - 1, 1);
            // End of month: Last day at 23:59:59.999
            const end = new Date(year, monthVal, 0, 23, 59, 59, 999);
            query.date = { $gte: start, $lte: end };
        }

        const expenses = await Expense.find(query).sort({ date: -1 });

        return NextResponse.json({ success: true, count: expenses.length, data: expenses });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { amount, category, date, description, merchant, paymentMethod, receiptUrl, isRecurring, recurringInterval } = body;

        // Validate required fields
        if (!amount || !category || !date) {
            return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
        }

        await dbConnect();

        // Use description if provided, otherwise fallback to Merchant, then to Category
        const finalDescription = description || merchant || `${category} Expense`;

        const expense = await Expense.create({
            userId: session.user.id,
            amount,
            category,
            date,
            description: finalDescription,
            merchant,
            paymentMethod,
            receiptUrl,
            isRecurring,
            recurringInterval
        });

        return NextResponse.json({ success: true, data: expense }, { status: 201 });
    } catch (error) {
        console.error('Error creating expense:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
