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
const DATA_DIR = path.join(__dirname, 'data');
const TMP_DIR = '/tmp';

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

const TMP_USERS_FILE = path.join(TMP_DIR, 'users.json');
const TMP_HISTORY_FILE = path.join(TMP_DIR, 'history.json');

// In-memory persistence to retain state across requests in process lifetime
let memoryUsers = null;
let memoryHistory = null;

// Helper functions to read/write JSON files with serverless fallback and memory cache
function readData(filePath, tmpFilePath) {
  if (filePath === USERS_FILE && memoryUsers !== null) {
    return memoryUsers;
  }
  if (filePath === HISTORY_FILE && memoryHistory !== null) {
    return memoryHistory;
  }

  let data = [];
  try {
    let baseData = [];
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      baseData = JSON.parse(content || '[]');
    }

    let tmpData = [];
    if (tmpFilePath && fs.existsSync(tmpFilePath)) {
      const content = fs.readFileSync(tmpFilePath, 'utf8');
      tmpData = JSON.parse(content || '[]');
    }

    // Merge base data with tmp data by ID (tmp entries take precedence)
    const map = new Map();
    baseData.forEach(item => { if (item && item.id) map.set(item.id, item); });
    tmpData.forEach(item => { if (item && item.id) map.set(item.id, item); });

    data = Array.from(map.values());
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    data = [];
  }

  if (filePath === USERS_FILE) memoryUsers = data;
  if (filePath === HISTORY_FILE) memoryHistory = data;

  return data;
}

function writeData(filePath, tmpFilePath, data) {
  if (filePath === USERS_FILE) memoryUsers = data;
  if (filePath === HISTORY_FILE) memoryHistory = data;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`Primary write to ${filePath} failed (serverless/read-only environment):`, e.message);
  }

  if (tmpFilePath) {
    try {
      fs.writeFileSync(tmpFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`Fallback write to ${tmpFilePath} failed:`, e.message);
    }
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
  let { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: "Username and password are required text strings." });
  }

  username = username.trim();
  password = password.trim();

  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters long." });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Password must be at least 4 characters long." });
  }

  const users = readData(USERS_FILE, TMP_USERS_FILE);
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
    writeData(USERS_FILE, TMP_USERS_FILE, users);

    // Generate JWT token so user can be automatically logged in after registration
    const token = jwt.sign({ id: newUser.id, username: newUser.username }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ message: "User registered successfully.", token, username: newUser.username });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post('/api/auth/login', async (req, res) => {
  let { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: "Username and password are required text strings." });
  }

  username = username.trim();
  password = password.trim();

  const users = readData(USERS_FILE, TMP_USERS_FILE);
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
  const history = readData(HISTORY_FILE, TMP_HISTORY_FILE);
  const userHistory = history.filter(h => h.userId === req.user.id);
  userHistory.sort((a, b) => b.timestamp - a.timestamp);
  res.json(userHistory);
});

app.post('/api/history', authenticateToken, (req, res) => {
  const { code, language, timeComplexity, spaceComplexity, bottleneck, optimized } = req.body;
  if (!code || !language) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const history = readData(HISTORY_FILE, TMP_HISTORY_FILE);
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
  writeData(HISTORY_FILE, TMP_HISTORY_FILE, history);
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
      const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
      let response;
      let lastErr;
      for (const modelName of candidateModels) {
        try {
          console.log(`Trying model: ${modelName}`);
          response = await generateContentWithRetry(ai, {
            model: modelName,
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
          if (response && response.text) break;
        } catch (mErr) {
          console.warn(`Model ${modelName} failed: ${mErr.message}`);
          lastErr = mErr;
        }
      }
      if (!response || !response.text) {
        throw lastErr || new Error("Failed to generate content with available Gemini models.");
      }
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

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✅ Backend running on port ${PORT}`);
  });
}

module.exports = app;