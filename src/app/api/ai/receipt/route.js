import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cloudinary from '@/lib/cloudinary';
import { authOptions } from '../../auth/[...nextauth]/route';
import Expense from '@/models/Expense';
import connectDB from '@/lib/db';

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

        // 2. Send to Google Gemini
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
      Extract expense details from this receipt.
      Return a JSON object with:
      - merchant (string): Name of the merchant/store
      - amount (number): Total amount (just the number)
      - currency (string): Currency code (e.g., INR, USD)
      - category (string): Best fit category (Food, Transport, Entertainment, Shopping, Utilities, Health, Other)
      - date (string): Date in YYYY-MM-DD format
      - description (string): Short description of items

      If it's not a receipt, return { "error": "not_a_receipt" }.
    `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Image,
                    mimeType: mimeType
                }
            }
        ]);

        const response = await result.response;
        const text = response.text();
        const cleanContent = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const extractedData = JSON.parse(cleanContent);

        if (extractedData.error) {
            return NextResponse.json({ error: 'Could not process receipt. Is this a valid receipt?' }, { status: 400 });
        }

        // 3. Save to MongoDB
        // Default to today if date missing
        const expenseDate = extractedData.date || new Date().toISOString().split('T')[0];

        const newExpense = await Expense.create({
            userId: session.user.id, // Ensure session.user.id is available from next-auth session callback
            title: extractedData.merchant || extractedData.description || 'Unknown Expense',
            description: extractedData.description || 'Receipt Scan',
            amount: extractedData.amount,
            category: extractedData.category || 'Other',
            date: expenseDate,
            receiptUrl: imageUrl,
            paymentMethod: 'Other'
        });

        return NextResponse.json({
            success: true,
            data: newExpense,
            extracted: extractedData
        });

    } catch (error) {
        console.error('Receipt Scan Error:', error);
        return NextResponse.json({ success: false, error: error.message || 'Processing failed' }, { status: 500 });
    }
}
