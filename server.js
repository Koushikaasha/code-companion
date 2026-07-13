require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenAI } = require('@google/genai');
const { authenticateToken, JWT_SECRET } = require('./auth');

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

// Database JSON file paths
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');

// Ensure data directory and files exist
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Helper functions to read/write JSON files
function readData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content || '[]');
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return [];
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error writing ${filePath}:`, e);
  }
}

// Helper for calling Gemini API with automatic exponential backoff retries on transient errors
async function generateContentWithRetry(ai, options, maxRetries = 5, initialDelay = 2000) {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent(options);
      return response;
    } catch (error) {
      console.warn(`[Gemini API Warning] Attempt ${attempt} failed: ${error.message}`);
      
      const isTransient = 
        error.status === 'UNAVAILABLE' || 
        error.message.includes("503") || 
        error.message.includes("429") || 
        error.message.includes("quota") ||
        error.status === 'RESOURCE_EXHAUSTED';
        
      if (isTransient && attempt < maxRetries) {
        console.log(`[Gemini API Retry] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
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

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = readData(USERS_FILE);
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Username already exists." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword
    };
    users.push(newUser);
    writeData(USERS_FILE, users);
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const users = readData(USERS_FILE);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  try {
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password." });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed." });
  }
});

// History Routes
app.get('/api/history', authenticateToken, (req, res) => {
  const history = readData(HISTORY_FILE);
  const userHistory = history.filter(h => h.userId === req.user.id);
  userHistory.sort((a, b) => b.timestamp - a.timestamp);
  res.json(userHistory);
});

app.post('/api/history', authenticateToken, (req, res) => {
  const { code, language, timeComplexity, spaceComplexity, bottleneck, optimized } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const history = readData(HISTORY_FILE);
  const historyItem = {
    id: Date.now().toString(),
    userId: req.user.id,
    code,
    language,
    timeComplexity,
    spaceComplexity,
    bottleneck,
    optimized,
    timestamp: Date.now()
  };

  history.push(historyItem);
  writeData(HISTORY_FILE, history);
  res.status(201).json(historyItem);
});

// Analysis Route
app.post('/api/analyze', authenticateToken, async (req, res) => {
  const { code, language } = req.body;
  const lang = language || 'cpp';

  if (!code) {
    return res.status(400).json({
      error: "No code snippet provided."
    });
  }

  const prompt = `
You are an expert compiler engineer and software performance optimizer.

Analyze the following ${lang} code.

Respond ONLY with valid JSON matching this schema:
{
  "time": "O(N)",
  "space": "O(1)",
  "bottleneck": "One short sentence explaining the main performance bottleneck.",
  "optimized": "// optimized ${lang} code"
}

Code:
${code}
`;

  try {
    let aiText = "";

    if (isOpenRouter) {
      // Use OpenRouter with retries
      console.log("Sending request to OpenRouter...");
      let routerResponse;
      let routerDelay = 2000;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          routerResponse = await axios.post(
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
          break;
        } catch (routerErr) {
          console.warn(`[OpenRouter Warning] Attempt ${attempt} failed:`, routerErr.message);
          if ((routerErr.response?.status === 503 || routerErr.response?.status === 429) && attempt < 4) {
            await new Promise(r => setTimeout(r, routerDelay));
            routerDelay *= 1.5;
          } else {
            throw routerErr;
          }
        }
      }
      aiText = routerResponse.data.choices[0].message.content.trim();
    } else {
      // Use Google Gen AI SDK with automatic retries
      console.log("Sending request to Google Gemini API...");
      if (!ai) {
        throw new Error("Gemini AI client not initialized. Check GEMINI_API_KEY.");
      }
      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              time: { type: 'STRING', description: 'Time complexity estimation, e.g. O(N)' },
              space: { type: 'STRING', description: 'Space complexity estimation, e.g. O(1)' },
              bottleneck: { type: 'STRING', description: 'One short sentence explaining the main performance issue.' },
              optimized: { type: 'STRING', description: `The fully optimized refactored ${lang} code.` }
            },
            required: ['time', 'space', 'bottleneck', 'optimized']
          }
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