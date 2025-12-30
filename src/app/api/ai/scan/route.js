import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import OpenAI from 'openai';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function POST(req) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        const prompt = `
      Analyze this receipt image and extract the following information in strict JSON format:
      - amount (number, just the total value)
      - date (string, ISO format YYYY-MM-DD if visible, or null)
      - category (string, choose best fit from: Food, Transport, Entertainment, Shopping, Utilities, Health, Other)
      - description (string, brief merchant name or summary)

      If the image is not a receipt, return { "error": "not_a_receipt" }.
      Do not include markdown formatting (like '''json). Just the raw JSON object.
    `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                "url": imageUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 300,
        });

        const content = response.choices[0].message.content;

        // Clean up potential markdown code blocks if GPT adds them
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
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
