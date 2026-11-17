import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ImportedTransactionSchema = new Schema({
    importJobId: {
        type: Schema.Types.ObjectId,
        ref: 'ImportJob',
        required: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    accountId: {
        type: Schema.Types.ObjectId,
        ref: 'FinancialAccount',
        required: true,
        index: true,
    },
    linkedExpenseId: {
        type: Schema.Types.ObjectId,
        ref: 'Expense',
        default: null,
    },
    sourceRowIndex: {
        type: Number,
        required: true,
    },
    transactionDate: {
        type: Date,
        required: true,
        index: true,
    },
    originalDescription: {
        type: String,
        required: true,
        trim: true,
    },
    normalizedDescription: {
        type: String,
        trim: true,
        default: '',
    },
    merchant: {
        type: String,
        trim: true,
        default: '',
    },
    direction: {
        type: String,
        enum: ['debit', 'credit'],
        required: true,
    },
    classification: {
        type: String,
        enum: ['expense', 'income', 'transfer', 'refund', 'unknown'],
        default: 'unknown',
        index: true,
    },
    amountMinor: {
        type: Number,
        required: true, // Integer minor units (e.g., cents or paise)
    },
    currency: {
        type: String,
        default: 'INR',
        uppercase: true,
    },
    category: {
        type: String,
        default: 'Other',
    },
    bankReference: {
        type: String,
        trim: true,
        default: '',
    },
    duplicateStatus: {
        type: String,
        enum: ['unique', 'possible_duplicate', 'confirmed_duplicate', 'not_duplicate'],
        default: 'unique',
        index: true,
    },
    duplicateFingerprint: {
        type: String,
        index: true,
    },
    duplicateOfTransactionId: {
        type: Schema.Types.ObjectId,
        ref: 'ImportedTransaction',
        default: null,
    },
    classificationSource: {
        type: String,
        enum: ['user_rule', 'deterministic', 'ai', 'manual', 'default'],
        default: 'default',
    },
    classificationConfidence: {
        type: Number,
        default: 0,
        min: 0,
        max: 1,
    },
    reviewRequired: {
        type: Boolean,
        default: false,
    },
    selected: {
        type: Boolean,
        default: true,
        index: true,
    },
    importStatus: {
        type: String,
        enum: ['pending', 'imported', 'skipped', 'failed'],
        default: 'pending',
        index: true,
    },
    importError: {
        type: String,
        default: '',
    },
    validationErrors: [{
        type: String,
    }],
}, { timestamps: true });

// Compound indexes for fast filtering, pagination, and deduplication
ImportedTransactionSchema.index({ importJobId: 1, sourceRowIndex: 1 }, { unique: true });
ImportedTransactionSchema.index({ userId: 1, accountId: 1, duplicateFingerprint: 1 });
ImportedTransactionSchema.index({ userId: 1, accountId: 1, bankReference: 1 });
ImportedTransactionSchema.index({ linkedExpenseId: 1 }, { sparse: true });
ImportedTransactionSchema.index({ importJobId: 1, classification: 1, selected: 1 });

const ImportedTransaction = models.ImportedTransaction || model('ImportedTransaction', ImportedTransactionSchema);

export default ImportedTransaction;
