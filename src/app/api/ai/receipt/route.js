import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import cloudinary from '@/lib/cloudinary';
import { authOptions } from '../../auth/[...nextauth]/route';
import Expense from '@/models/Expense';
import connectDB from '@/lib/db';
import { extractReceiptDetails } from '@/lib/groq';

// Helper to convert file to buffer for Cloudinary
async function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'spendsense/receipts' },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result);
            }
        ).end(buffer);
    });
}

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        // Prepare buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Image = buffer.toString('base64');
        const mimeType = file.type || 'image/jpeg';

        // 1. Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(buffer);
        const imageUrl = uploadResult.secure_url;

        // 2. Send to Groq Vision
        const extractedData = await extractReceiptDetails({
            base64Image,
            mimeType,
            imageUrl
        });

        if (!extractedData || extractedData.error) {
            return NextResponse.json({ error: 'Could not process receipt. Is this a valid receipt?' }, { status: 400 });
        }

        // 3. Save to MongoDB
        const expenseDate = extractedData.date ? new Date(extractedData.date) : new Date();
        const amount = typeof extractedData.amount === 'number' ? extractedData.amount : parseFloat(extractedData.amount || '0');

        const newExpense = await Expense.create({
            userId: session.user.id,
            merchant: extractedData.merchant || 'Unknown Merchant',
            description: extractedData.description || extractedData.merchant || 'Receipt Scan',
            amount: isNaN(amount) ? 0 : amount,
            category: extractedData.category || 'Other',
            date: expenseDate,
            receiptUrl: imageUrl,
            paymentMethod: 'Other',
            source: 'receipt_scan'
        });

        return NextResponse.json({
            success: true,
            data: newExpense,
            extracted: extractedData
        });

    } catch (error) {
        console.error('Receipt Scan Error (Groq):', error);
        return NextResponse.json({ success: false, error: error.message || 'Processing failed' }, { status: 500 });
    }
}
