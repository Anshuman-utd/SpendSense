import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

async function testGeminiLatest() {
    console.log("Testing gemini-flash-latest...");
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("❌ GOOGLE_API_KEY is missing");
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const result = await model.generateContent("Hello!");
        const response = await result.response;
        const text = response.text();
        console.log("✅ Response:", text);
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

testGeminiLatest();
