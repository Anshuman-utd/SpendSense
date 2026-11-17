import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ExpenseSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    amount: {
        type: Number,
        required: [true, 'Please provide an amount'],
    },
    category: {
        type: String,
        required: [true, 'Please provide a category'],
    },
    date: {
        type: Date,
        required: [true, 'Please provide a date'],
        default: Date.now,
    },
    description: {
        type: String,
        required: [true, 'Please provide a description'],
    },
    merchant: {
        type: String,
    },
    paymentMethod: {
        type: String,
        default: 'Cash',
    },
    receiptUrl: {
        type: String,
    },
    isRecurring: {
        type: Boolean,
        default: false,
    },
    recurringInterval: {
        type: String, // e.g., 'monthly', 'weekly'
        enum: ['daily', 'weekly', 'monthly', 'yearly', null],
        default: null,
    },
    subscriptionStatus: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
    },
    source: {
        type: String,
        enum: ['manual', 'receipt_scan', 'import', 'recurring'],
        default: 'manual',
    },
    importJobId: {
        type: Schema.Types.ObjectId,
        ref: 'ImportJob',
    },
    importedTransactionId: {
        type: Schema.Types.ObjectId,
        ref: 'ImportedTransaction',
    },
    financialAccountId: {
        type: Schema.Types.ObjectId,
        ref: 'FinancialAccount',
    },
    currency: {
        type: String,
        default: 'INR',
    },
    sourceReference: {
        type: String,
    },
}, { timestamps: true });

ExpenseSchema.index({ importedTransactionId: 1 }, { unique: true, sparse: true });

const Expense = models.Expense || model('Expense', ExpenseSchema);

export default Expense;
