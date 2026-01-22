import dotenv from 'dotenv';
dotenv.config();

async function listModelsRest() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("❌ GOOGLE_API_KEY is missing");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`❌ HTTP Error: ${response.status}`);
            return;
        }

        const data = await response.json();
        const models = data.models || [];

        console.log("Found " + models.length + " models.");
        console.log("Filtering for 'flash'...");

        const flashModels = models.filter(m => m.name.toLowerCase().includes('flash'));
        flashModels.forEach(m => {
            console.log(`- Name: ${m.name}`);
            console.log(`  Version: ${m.version}`);
            console.log(`  Methods: ${m.supportedGenerationMethods.join(', ')}`);
        });

        console.log("\nFiltering for 'gemini-1.5'...");
        const gemini15 = models.filter(m => m.name.toLowerCase().includes('gemini-1.5') && !m.name.toLowerCase().includes('flash'));
        gemini15.forEach(m => {
            console.log(`- Name: ${m.name}`);
        });

    } catch (error) {
        console.error("❌ Fetch Error:", error);
    }
}

listModelsRest();
