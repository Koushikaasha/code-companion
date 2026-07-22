require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function run() {
  const prompt = `
You are an expert compiler engineer and software performance optimizer.

Analyze the following C++ code.

Code:
#include <vector>
using namespace std;
int sum(vector<int>& arr) {
  int s = 0;
  for (int i = 0; i < arr.size(); i++) {
    s += arr[i];
  }
  return s;
}
`;

  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
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
            optimized: { type: 'STRING', description: `The fully optimized refactored C++ code.` }
          },
          required: ['time', 'space', 'bottleneck', 'optimized']
        }
      }
    });

    console.log("Status: Success");
    console.log("Response text:", response.text.trim());
    console.log(`Time taken: ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error("Status: Failed");
    console.error("Error:", error);
  }
}

run();
