# 🚀 Code Companion

**Code Companion** is an AI-powered full-stack web application that analyzes source code and provides explanations, time and space complexity estimation, optimization suggestions, and refactored code using the Google Gemini API. Users sign in to a personal workspace and can revisit past analyses from a dedicated dashboard.

## 🌐 Live Demo

**Website:** https://code-companion-ecru.vercel.app/

---

## ✨ Features

* 🔐 User authentication (Sign In / Sign Up) with private, per-user workspaces
* 💻 Interactive Monaco Editor with drag-and-drop file uploads
* 🤖 AI-powered code analysis (Gemini 3.1 Flash-Lite)
* ⚡ Time & Space complexity estimation (Big O)
* 🎯 Isolated bottleneck detection
* 🔄 Code optimization and refactoring
* 🆚 Side-by-side diff view (original vs. optimized code)
* 📊 Optimization Dashboard — track total optimizations, last activity, and reload past analyses
* 📄 Export analysis reports as PDF
* 🌍 Multi-language support (C++, Java, Python)
* 🎨 Modern responsive UI

---

## 🛠 Tech Stack

| Frontend                              | Backend             | Auth                     | AI                                  | Deployment     |
| -------------------------------------- | -------------------- | ------------------------- | ------------------------------------ | -------------- |
| React.js, Tailwind CSS, Monaco Editor  | Node.js, Express.js  | Session/token-based auth  | Google Gemini API (3.1 Flash-Lite)   | Vercel, Render |

---

## 🚀 Run Locally

### Clone the repository

```bash
git clone https://github.com/Koushikaasha/code-companion.git
cd code-companion
```

### Frontend

```bash
cd code-companion-frontend
npm install
npm run dev
```

### Backend

```bash
cd code-companion-backend
npm install
npm run dev
```

Create a `.env` file:

```env
GEMINI_API_KEY=your_api_key
PORT=5000
JWT_SECRET=your_jwt_secret
```

---

## 👨‍💻 Authors

A Koushiksai
Tatikonda Sravya
Miryala Varshini

GitHub: https://github.com/Koushikaasha, https://github.com/tatikondasravyareddy, https://github.com/varshinimiriyala28-lab
