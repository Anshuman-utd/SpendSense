import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import ImportedTransaction from '@/models/ImportedTransaction';
import ImportJob from '@/models/ImportJob';
import MerchantCategoryRule from '@/models/MerchantCategoryRule';
import { normalizeMerchantKey } from '@/lib/imports/merchantExtractor';
import { authOptions } from '../../../../auth/[...nextauth]/route';

export async function PATCH(req, { params }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { id, transactionId } = await params;
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(transactionId)) {
            return NextResponse.json({ success: false, error: 'Invalid job ID or transaction ID' }, { status: 400 });
        }

        const body = await req.json();
        const { category, merchant, selected, classification, duplicateStatus } = body;

        await dbConnect();

        const transaction = await ImportedTransaction.findOne({
            _id: transactionId,
            importJobId: id,
            userId: session.user.id
        });

        if (!transaction) {
            return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
        }

        // Apply edits
        if (typeof selected === 'boolean') {
            transaction.selected = selected;
        }

        if (merchant && typeof merchant === 'string') {
            transaction.merchant = merchant.trim();
        }

        if (classification && ['expense', 'income', 'transfer', 'refund', 'unknown'].includes(classification)) {
            transaction.classification = classification;
        }

        if (duplicateStatus && ['unique', 'possible_duplicate', 'confirmed_duplicate', 'not_duplicate'].includes(duplicateStatus)) {
            transaction.duplicateStatus = duplicateStatus;
            if (duplicateStatus === 'not_duplicate') {
                transaction.reviewRequired = false;
            }
        }

        if (category && typeof category === 'string') {
            transaction.category = category.trim();
            transaction.classificationSource = 'manual';

            // Store user-defined rule for this merchant (Level 1 personalization)
            const targetMerchant = transaction.merchant || transaction.normalizedDescription;
            const normKey = normalizeMerchantKey(targetMerchant);
            if (normKey) {
                await MerchantCategoryRule.findOneAndUpdate(
                    { userId: session.user.id, normalizedMerchant: normKey },
                    { category: category.trim() },
                    { upsert: true, new: true }
                ).catch((err) => console.warn('[Patch Transaction] Error saving merchant rule:', err.message));
            }
        }

        await transaction.save();

        // Update Job summary stats
        const allSelected = await ImportedTransaction.find({
            importJobId: id,
            selected: true,
            classification: 'expense'
        }).select('amountMinor').lean();

        const totalSelectedAmount = allSelected.reduce((sum, t) => sum + (t.amountMinor / 100), 0);
        await ImportJob.findByIdAndUpdate(id, {
            approvedRows: allSelected.length,
            selectedAmountTotal: Math.round(totalSelectedAmount * 100) / 100
        });

        return NextResponse.json({ success: true, data: transaction });

    } catch (error) {
        console.error('Update transaction error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Failed to update transaction' }, { status: 500 });
    }
}
