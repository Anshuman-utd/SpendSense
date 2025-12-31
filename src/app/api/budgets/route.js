import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import Budget from '@/models/Budget';
import { authOptions } from '../auth/[...nextauth]/route';

export async function GET(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { searchParams } = new URL(req.url);
        const month = parseInt(searchParams.get('month'));
        const year = parseInt(searchParams.get('year'));

        if (isNaN(month) || isNaN(year)) {
            return NextResponse.json({ success: false, error: 'Invalid date parameters' }, { status: 400 });
        }

        const budget = await Budget.findOne({
            userId: session.user.id,
            month,
            year
        });

        // Calculate total budget
        const totalBudget = budget ? budget.categories.reduce((acc, curr) => acc + curr.amount, 0) : 0;

        return NextResponse.json({
            success: true,
            data: budget || { categories: [] },
            totalBudget
        });

    } catch (error) {
        console.error('Error fetching budget:', error);
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
        const { month, year, category, amount } = body;

        if (isNaN(month) || isNaN(year) || !category || isNaN(amount)) {
            return NextResponse.json({ success: false, error: 'Missing or invalid fields' }, { status: 400 });
        }

        await dbConnect();

        // Upsert the budget document
        let budget = await Budget.findOne({
            userId: session.user.id,
            month,
            year
        });

        if (!budget) {
            budget = new Budget({
                userId: session.user.id,
                month,
                year,
                categories: []
            });
        }

        // Update or add the specific category budget
        const catIndex = budget.categories.findIndex(c => c.category === category);
        if (catIndex > -1) {
            budget.categories[catIndex].amount = amount;
        } else {
            budget.categories.push({ category, amount });
        }

        await budget.save();

        const totalBudget = budget.categories.reduce((acc, curr) => acc + curr.amount, 0);

        return NextResponse.json({ success: true, data: budget, totalBudget });

    } catch (error) {
        console.error('Error updating budget:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
