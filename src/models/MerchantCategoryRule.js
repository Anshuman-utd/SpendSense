import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const MerchantCategoryRuleSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    normalizedMerchant: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    category: {
        type: String,
        required: true,
    },
}, { timestamps: true });

MerchantCategoryRuleSchema.index({ userId: 1, normalizedMerchant: 1 }, { unique: true });

const MerchantCategoryRule = models.MerchantCategoryRule || model('MerchantCategoryRule', MerchantCategoryRuleSchema);

export default MerchantCategoryRule;
