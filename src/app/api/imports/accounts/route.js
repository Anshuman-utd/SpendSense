import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/db';
import FinancialAccount from '@/models/FinancialAccount';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        let accounts = await FinancialAccount.find({ userId: session.user.id }).sort({ isDefault: -1, createdAt: -1 });

        // If user has no financial accounts yet, create a default one for convenient onboarding
        if (accounts.length === 0) {
            const defaultAcc = await FinancialAccount.create({
                userId: session.user.id,
                accountName: 'Primary Bank Account',
                accountType: 'savings',
                currency: 'INR',
                isDefault: true,
            });
            accounts = [defaultAcc];
        }

        return NextResponse.json({ success: true, data: accounts });

    } catch (error) {
        console.error('Fetch accounts error:', error);
        return NextResponse.json({ success: false, error: 'Failed to retrieve accounts' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { accountName, institutionName, accountType, currency, maskedAccountIdentifier } = body;

        if (!accountName || !accountName.trim()) {
            return NextResponse.json({ success: false, error: 'Account name is required' }, { status: 400 });
        }

        await dbConnect();

        // Check if an account with this name already exists for the user
        const existing = await FinancialAccount.findOne({
            userId: session.user.id,
            accountName: accountName.trim()
        });

        if (existing) {
            return NextResponse.json({ success: false, error: 'An account with this name already exists' }, { status: 400 });
        }

        const newAccount = await FinancialAccount.create({
            userId: session.user.id,
            accountName: accountName.trim(),
            institutionName: (institutionName || '').trim(),
            accountType: accountType || 'savings',
            currency: (currency || 'INR').toUpperCase().trim(),
            maskedAccountIdentifier: (maskedAccountIdentifier || '').trim(),
            isDefault: false
        });

        return NextResponse.json({ success: true, data: newAccount }, { status: 201 });

    } catch (error) {
        console.error('Create account error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to create account' }, { status: 500 });
    }
}
