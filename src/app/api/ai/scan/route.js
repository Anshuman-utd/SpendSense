import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        // Fetch image and convert to base64
        const imageResp = await fetch(imageUrl);
        if (!imageResp.ok) {
            throw new Error(`Failed to fetch image: ${imageResp.statusText}`);
        }
        const arrayBuffer = await imageResp.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = imageResp.headers.get('content-type') || 'image/jpeg';


        const prompt = `
      Analyze this receipt image and extract the following information in strict JSON format:
      - amount (number, just the total value)
      - date (string, ISO format YYYY-MM-DD if visible, or null)
      - category (string, choose best fit from: Food, Transport, Entertainment, Shopping, Utilities, Health, Other)
      - description (string, brief merchant name or summary)

      If the image is not a receipt, return { "error": "not_a_receipt" }.
      Do not include markdown formatting (like '''json). Just the raw JSON object.
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

        // Clean up potential markdown code blocks
        const cleanContent = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanContent);

        if (data.error) {
            return NextResponse.json({ success: false, error: 'Could not process receipt' }, { status: 400 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('AI Scan Error:', error);
        return NextResponse.json({ success: false, error: 'AI processing failed' }, { status: 500 });
    }
}
