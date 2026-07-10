require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

const apiKey = process.env.GEMINI_API_KEY;
console.log("API exists:", !!apiKey);
console.log("Length:", apiKey?.length);
console.log("Prefix:", apiKey?.substring(0, 8));

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing!");
}

// Detect mode based on API key prefix
const isOpenRouter = apiKey && apiKey.startsWith('sk-');
console.log("Mode:", isOpenRouter ? "OpenRouter" : "Google Gemini Direct");

// Initialize Gemini client (only if direct mode)
let ai;
if (!isOpenRouter && apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

// Debug Route
app.get('/api/test-key', (req, res) => {
  res.json({
    hasKey: !!process.env.GEMINI_API_KEY,
    length: process.env.GEMINI_API_KEY?.length || 0,
    prefix: process.env.GEMINI_API_KEY?.substring(0, 8),
    mode: isOpenRouter ? "OpenRouter" : "Google Gemini Direct"
  });
});

app.post('/api/analyze', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      error: "No code snippet provided."
    });
  }

  const prompt = `
You are an expert compiler engineer.

Analyze the following C++ code.

Respond ONLY with valid JSON.

{
  "time":"O(N)",
  "space":"O(1)",
  "bottleneck":"One short sentence.",
  "optimized":"// optimized C++ code"
}

Code:
${code}
`;

  try {
    let aiText = "";

    if (isOpenRouter) {
      // Use OpenRouter
      console.log("Sending request to OpenRouter...");
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "google/gemini-3.5-flash",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "Code Companion"
          }
        }
      );
      aiText = response.data.choices[0].message.content.trim();
    } else {
      // Use Google Gen AI SDK
      console.log("Sending request to Google Gemini API...");
      if (!ai) {
        throw new Error("Gemini AI client not initialized. Check GEMINI_API_KEY.");
      }
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });
      aiText = response.text.trim();
    }

    console.log("========== AI RESPONSE ==========");
    console.log(aiText);
    console.log("=================================");

    // Clean up potential markdown formatting wrapping the JSON
    let cleanedText = aiText;
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.substring(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.substring(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    const result = JSON.parse(cleanedText);

    res.json({
      time: result.time || "N/A",
      space: result.space || "N/A",

      time_complexity: result.time || "N/A",
      space_complexity: result.space || "N/A",

      timeComplexity: result.time || "N/A",
      spaceComplexity: result.space || "N/A",

      bottleneck: result.bottleneck || "No bottleneck found.",
      optimized: result.optimized || "// No optimized code returned."
    });

  } catch (error) {
    console.error("========== API ERROR ==========");
    console.error(error);

    const errorMessage = error.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;

    return res.status(500).json({
      error: isOpenRouter ? "OpenRouter API Error" : "Gemini API Error",
      details: errorMessage
    });
  }
});

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});