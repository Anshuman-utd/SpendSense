import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import Expense from '@/models/Expense';
import Budget from '@/models/Budget';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function PUT(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, image } = body;

        await dbConnect();

        const updatedUser = await User.findByIdAndUpdate(
            session.user.id,
            { name, image },
            { new: true, runValidators: true }
        ).select('-password');

        return NextResponse.json({ success: true, data: updatedUser });

    } catch (error) {
        console.error('Update Profile Error:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        // Delete all associated data
        await Promise.all([
            Expense.deleteMany({ userId: session.user.id }),
            Budget.deleteMany({ userId: session.user.id }),
            // Add other models if necessary, e.g. Goals, etc.
            User.findByIdAndDelete(session.user.id)
        ]);

        return NextResponse.json({ success: true, message: 'Account deleted successfully' });

    } catch (error) {
        console.error('Delete Account Error:', error);
        return NextResponse.json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}
