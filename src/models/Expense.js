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
    }
}, { timestamps: true });

const Expense = models.Expense || model('Expense', ExpenseSchema);

export default Expense;
