import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { extractReceiptDetails } from '@/lib/groq';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        const data = await extractReceiptDetails({ base64Image, mimeType, imageUrl });

        if (!data || data.error) {
            return NextResponse.json({ success: false, error: 'Could not process receipt' }, { status: 400 });
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('AI Scan Error (Groq):', error);
        return NextResponse.json({ success: false, error: error.message || 'AI processing failed' }, { status: 500 });
    }
}
