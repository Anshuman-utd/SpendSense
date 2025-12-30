import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import Expense from '@/models/Expense';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        await dbConnect();

        const expense = await Expense.findOne({ _id: id, userId: session.user.id });

        if (!expense) {
            return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: expense });
    } catch (error) {
        console.error('Error details:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        const body = await req.json();

        await dbConnect();

        const expense = await Expense.findOne({ _id: id, userId: session.user.id });

        if (!expense) {
            return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
        }

        // Update fields
        const updatedExpense = await Expense.findByIdAndUpdate(id, body, {
            new: true,
            runValidators: true,
        });

        return NextResponse.json({ success: true, data: updatedExpense });
    } catch (error) {
        console.error('Error updating expense:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        await dbConnect();

        const expense = await Expense.findOne({ _id: id, userId: session.user.id });

        if (!expense) {
            return NextResponse.json({ success: false, error: 'Expense not found' }, { status: 404 });
        }

        await expense.deleteOne();

        return NextResponse.json({ success: true, data: {} });
    } catch (error) {
        console.error('Error deleting expense:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
