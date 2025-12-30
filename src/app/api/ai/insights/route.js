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

        const { expenseSummary, userBudget } = await req.json();

        const prompt = `
      You are a financial advisor. Analyze the following spending summary for this month:
      ${JSON.stringify(expenseSummary)}
      
      The user's monthly budget is: ${userBudget || 'Not set'}.

      Provide:
      1. A brief 2-sentence summary of their habits.
      2. One actionable tip to save money.
      3. A budget recommendation (if they are overspending or haven't set one).

      Return the response in JSON format with keys: "summary", "tip", "budgetRecommendation".
    `;

        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "You are a helpful financial assistant." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        const data = JSON.parse(content);

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('AI Insights Error:', error);
        return NextResponse.json({ success: false, error: 'AI processing failed' }, { status: 500 });
    }
}
