import Groq from 'groq-sdk';

/**
 * Centralized Groq AI Client & Utilities for SpendSense
 * Supports configurable models, structured JSON outputs, retries with backoff,
 * and graceful fallback mechanisms.
 */

const DEFAULT_TEXT_MODEL = process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b';
const DEFAULT_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

let groqInstance = null;

export function getGroqClient() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return null;
    }
    if (!groqInstance) {
        groqInstance = new Groq({ apiKey });
    }
    return groqInstance;
}

/**
 * Execute a Groq completion with retries and exponential backoff.
 */
export async function runWithRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const status = error?.status || error?.statusCode;
            // Retry on rate limits (429) or transient server errors (500, 502, 503, 504)
            const isRetryable = status === 429 || (status >= 500 && status <= 504) || error?.code === 'ETIMEDOUT';
            if (!isRetryable || attempt === maxRetries - 1) {
                throw error;
            }
            const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
            console.warn(`[Groq] Request failed with ${error?.message || error}. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}

/**
 * Generate a JSON structured response using Groq text models.
 */
export async function generateTextJson({ prompt, systemPrompt, model = DEFAULT_TEXT_MODEL, temperature = 0.1 }) {
    const client = getGroqClient();
    if (!client) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    return await runWithRetry(async () => {
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Groq returned empty response');
        }

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    });
}

/**
 * Analyze an image using Groq vision models.
 */
export async function generateVisionJson({
    prompt,
    base64Image,
    mimeType = 'image/jpeg',
    imageUrl,
    model = DEFAULT_VISION_MODEL,
    temperature = 0.1
}) {
    const client = getGroqClient();
    if (!client) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    let url = imageUrl;
    if (!url && base64Image) {
        url = `data:${mimeType};base64,${base64Image}`;
    }
    if (!url) {
        throw new Error('No image provided (either base64Image or imageUrl required)');
    }

    const messages = [
        {
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                {
                    type: 'image_url',
                    image_url: { url }
                }
            ]
        }
    ];

    return await runWithRetry(async () => {
        const completion = await client.chat.completions.create({
            model,
            messages,
            temperature,
            response_format: { type: 'json_object' }
        });

        const content = completion.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Groq returned empty vision response');
        }

        const clean = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    });
}

/**
 * Scan a receipt image and extract structured expense fields.
 */
export async function extractReceiptDetails({ base64Image, mimeType, imageUrl }) {
    const prompt = `
Extract expense details from this receipt image.
Return a valid JSON object matching this schema exactly:
{
  "merchant": "string (name of the store/merchant or null)",
  "amount": number (positive numeric total amount, e.g. 450.50, or null),
  "currency": "string (ISO currency code, e.g. INR, USD, EUR)",
  "category": "string (choose best from: Food, Transport, Shopping, Entertainment, Housing, Utilities, Health, Education, Personal, Other)",
  "date": "string (date in YYYY-MM-DD format if visible, or null)",
  "description": "string (brief summary of items purchased)"
}

If the image is not a receipt or illegible, return { "error": "not_a_receipt" }.
Output JSON only. Do not add markdown backticks.
`;

    return await generateVisionJson({ prompt, base64Image, mimeType, imageUrl });
}

/**
 * Generate spending insights and recommendations from 30-day spending data.
 */
export async function generateSpendingInsights({ totalSpent, topCategory, categoryBreakdown, transactionCount }) {
    const systemPrompt = 'You are a personal finance advisor. Respond strictly with a JSON object.';
    const prompt = `
Here is the user's spending summary for the last 30 days:
- Total Spent: ${totalSpent}
- Top Category: ${topCategory || 'None'}
- Category Breakdown: ${JSON.stringify(categoryBreakdown)}
- Total Transactions: ${transactionCount}

Tasks:
1. Provide a concise 1-2 sentence overview of spending patterns.
2. Identify 1-2 areas for attention or potential overspending.
3. Provide 3 practical, actionable tips to save money.

Return a JSON object with:
{
  "summary": "Short 1-2 sentence overview",
  "problems": ["observation 1", "observation 2"],
  "tips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]
}
`;

    return await generateTextJson({ prompt, systemPrompt });
}

/**
 * Categorize a single transaction description/merchant using Groq.
 */
export async function categorizeWithGroq(descriptionOrMerchant, allowedCategories = []) {
    const categoriesList = allowedCategories.length > 0
        ? allowedCategories.join(', ')
        : 'Food, Transport, Shopping, Entertainment, Housing, Utilities, Health, Education, Personal, Other';

    const systemPrompt = 'You are a financial transaction categorization assistant. Return JSON only.';
    const prompt = `
Categorize the following transaction description or merchant:
"${descriptionOrMerchant}"

Allowed categories:
${categoriesList}

Return a valid JSON object:
{
  "category": "string (exact match from allowed categories)",
  "confidence": number (between 0.0 and 1.0)
}
`;

    try {
        const result = await generateTextJson({ prompt, systemPrompt, temperature: 0.0 });
        if (result && result.category) {
            return {
                category: result.category,
                confidence: typeof result.confidence === 'number' ? result.confidence : 0.7
            };
        }
    } catch (error) {
        console.warn(`[Groq] Categorization failed for "${descriptionOrMerchant}":`, error.message);
    }

    return { category: 'Other', confidence: 0.1 };
}
