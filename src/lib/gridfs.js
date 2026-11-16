import mongoose from 'mongoose';
import { Readable } from 'stream';

const BUCKET_NAME = 'statement_files';

function getBucket() {
    if (!mongoose.connection.db) {
        throw new Error('MongoDB is not connected. Call dbConnect() first.');
    }
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: BUCKET_NAME
    });
}

/**
 * Upload a raw statement file buffer to MongoDB GridFS.
 * Returns the GridFS file ObjectId.
 */
export async function uploadToGridFS({ buffer, filename, contentType = 'text/csv', metadata = {} }) {
    const bucket = getBucket();
    const stream = Readable.from(buffer);
    const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: {
            ...metadata,
            uploadedAt: new Date()
        }
    });

    return new Promise((resolve, reject) => {
        stream
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', () => resolve(uploadStream.id));
    });
}

/**
 * Read the entire contents of a GridFS file as a UTF-8 string.
 */
export async function readFromGridFSAsText(fileId) {
    const bucket = getBucket();
    const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    const downloadStream = bucket.openDownloadStream(objectId);

    const chunks = [];
    return new Promise((resolve, reject) => {
        downloadStream
            .on('data', (chunk) => chunks.push(chunk))
            .on('error', reject)
            .on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

/**
 * Delete a file from MongoDB GridFS.
 */
export async function deleteFromGridFS(fileId) {
    if (!fileId) return;
    const bucket = getBucket();
    const objectId = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    try {
        await bucket.delete(objectId);
    } catch (error) {
        console.warn(`[GridFS] Failed to delete file ${fileId}:`, error.message);
    }
}

/**
 * Cleanup orphaned or expired GridFS files older than the retention threshold.
 */
export async function cleanupExpiredGridFSFiles(olderThanHours = 24) {
    if (!mongoose.connection.db) return { deleted: 0 };
    const bucket = getBucket();
    const thresholdDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const filesCollection = mongoose.connection.db.collection(`${BUCKET_NAME}.files`);
    const expiredFiles = await filesCollection.find({
        uploadDate: { $lt: thresholdDate }
    }).toArray();

    let deleted = 0;
    for (const file of expiredFiles) {
        try {
            await bucket.delete(file._id);
            deleted++;
        } catch (err) {
            console.warn(`[GridFS] Error deleting expired file ${file._id}:`, err.message);
        }
    }
    return { deleted, totalChecked: expiredFiles.length };
}
