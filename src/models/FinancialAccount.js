import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const FinancialAccountSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    accountName: {
        type: String,
        required: [true, 'Please provide an account name'],
        trim: true,
    },
    institutionName: {
        type: String,
        trim: true,
        default: '',
    },
    accountType: {
        type: String,
        enum: ['savings', 'current', 'credit_card', 'salary', 'wallet', 'other'],
        default: 'savings',
    },
    currency: {
        type: String,
        default: 'INR',
        trim: true,
        uppercase: true,
    },
    maskedAccountIdentifier: {
        type: String,
        trim: true,
        default: '', // e.g., 'XX4920'
    },
    isDefault: {
        type: Boolean,
        default: false,
    }
}, { timestamps: true });

FinancialAccountSchema.index({ userId: 1, accountName: 1 }, { unique: true });

const FinancialAccount = models.FinancialAccount || model('FinancialAccount', FinancialAccountSchema);

export default FinancialAccount;
