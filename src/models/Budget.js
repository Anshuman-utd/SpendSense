import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const BudgetSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    month: {
        type: Number, // 0-11
        required: true,
    },
    year: {
        type: Number,
        required: true,
    },
    categories: [{
        category: {
            type: String,
            required: true,
        },
        amount: {
            type: Number,
            default: 0,
        }
    }]
}, { timestamps: true });

// Ensure unique budget per user per month
BudgetSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

const Budget = models.Budget || model('Budget', BudgetSchema);

export default Budget;
