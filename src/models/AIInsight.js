import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const AIInsightSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    period: {
        type: String,
        enum: ['weekly', 'monthly'],
        required: true,
    },
    data: {
        summary: { type: String },
        problems: [{ type: String }],
        tips: [{ type: String }],
    },
}, { timestamps: true });

const AIInsight = models.AIInsight || model('AIInsight', AIInsightSchema);

export default AIInsight;
