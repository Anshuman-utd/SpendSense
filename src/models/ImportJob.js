import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const ImportJobSchema = new Schema({
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
    originalFilename: {
        type: String,
        required: true,
    },
    fileChecksum: {
        type: String,
        required: true,
        index: true,
    },
    fileSize: {
        type: Number,
        required: true,
    },
    // GridFS file reference for proper staging & cleanup (correction #3)
    gridFSFileId: {
        type: Schema.Types.ObjectId,
        default: null,
    },
    status: {
        type: String,
        enum: [
            'uploaded',
            'mapping_required',
            'processing',
            'ready_for_review',
            'importing',
            'completed',
            'partially_completed',
            'failed',
            'cancelled'
        ],
        default: 'uploaded',
        index: true,
    },
    selectedMapping: {
        type: Schema.Types.Mixed,
        default: null, // { date, description, debit, credit, amount, transactionType, reference, balance }
    },
    detectedFormat: {
        type: Schema.Types.Mixed,
        default: null,
    },
    dateFormat: {
        type: String,
        default: 'DD/MM/YYYY',
    },
    currency: {
        type: String,
        default: 'INR',
    },
    totalRows: {
        type: Number,
        default: 0,
    },
    validRows: {
        type: Number,
        default: 0,
    },
    invalidRows: {
        type: Number,
        default: 0,
    },
    duplicateRows: {
        type: Number,
        default: 0,
    },
    creditRows: {
        type: Number,
        default: 0,
    },
    approvedRows: {
        type: Number,
        default: 0,
    },
    importedRows: {
        type: Number,
        default: 0,
    },
    failedRows: {
        type: Number,
        default: 0,
    },
    selectedAmountTotal: {
        type: Number,
        default: 0, // In standard monetary units
    },
    progress: {
        stage: { type: String, default: 'File uploaded' },
        percent: { type: Number, default: 0 },
        message: { type: String, default: 'Waiting to start' }
    },
    errorSummary: [{
        type: String,
    }],
    startedAt: {
        type: Date,
    },
    completedAt: {
        type: Date,
    }
}, { timestamps: true });

ImportJobSchema.index({ userId: 1, createdAt: -1 });
ImportJobSchema.index({ userId: 1, fileChecksum: 1, accountId: 1 });

const ImportJob = models.ImportJob || model('ImportJob', ImportJobSchema);

export default ImportJob;
