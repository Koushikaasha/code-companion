# 🚀 Code Companion

**Code Companion** is an AI-powered full-stack web application that analyzes source code and provides explanations, time and space complexity estimation, optimization suggestions, and refactored code using the Google Gemini API. Users sign in to a personal workspace and can revisit past analyses from a dedicated dashboard.

---

## 🌐 Live Demo & Project Resources

* 🔗 **Live Website:** [https://code-companion-ecru.vercel.app/](https://code-companion-ecru.vercel.app/)
* 📄 **EPBL Project Report:** [Download EPBL_Project_Report.pdf](EPBL_Project_Report.pdf)
* 📸 **Screenshots & Visuals:** [View SCREENSHOTS.md](SCREENSHOTS.md)

---

## ✨ Features

* 🔐 **User Authentication:** Sign In / Sign Up with session-based JWT authentication and private per-user workspaces.
* 💻 **Interactive Monaco Editor:** Native IDE experience with drag-and-drop file support across C++, Java, and Python.
* 🤖 **AI-powered Code Analysis:** Powered by Google Gemini API (Gemini 2.0 / 1.5 Flash) for deep code insights.
* ⚡ **Complexity Estimation:** Automatic Big-O Time & Space complexity calculation.
* 🎯 **Isolated Bottleneck Detection:** Highlights performance bottlenecks in submitted code.
* 🔄 **Side-by-Side Optimization Diff:** Visual comparison of original vs refactored/optimized code.
* 📊 **Optimization Dashboard:** Archival and history tracking for past code submissions with quick reload.
* 📄 **PDF Report Export:** Download PDF summaries of code analysis.

---

## 📸 Screenshots Overview

| 🔐 Sign In Screen | 💻 Analyzer Workspace (Idle) |
| :---: | :---: |
| ![Sign In](screenshots/01_signin_screen.png) | ![Analyzer Idle](screenshots/02_analyzer_idle.png) |

| ⚡ AI Code Analysis & Diff | 📊 Optimization Dashboard |
| :---: | :---: |
| ![AI Analysis](screenshots/03_analyzer_results_diff.png) | ![Dashboard](screenshots/04_optimization_dashboard.png) |

---

## 🛠 Tech Stack

| Frontend                              | Backend             | Auth                     | AI                                  | Deployment     |
| -------------------------------------- | -------------------- | ------------------------- | ------------------------------------ | -------------- |
| HTML, Tailwind CSS, Monaco Editor  | Node.js, Express.js  | Session/token-based auth  | Google Gemini API                   | Vercel, Render |

---

## 🚀 Run Locally

### Clone the repository

```bash
git clone https://github.com/Koushikaasha/code-companion.git
cd code-companion
```

### Install & Run

```bash
npm install
npm start
```

Create a `.env` file:

```env
GEMINI_API_KEY=your_api_key
PORT=5000
JWT_SECRET=your_jwt_secret
```

---

## 👨‍💻 Student Details & Credits

* **A Koushiksai** (Roll No: 23881A04C7) - [GitHub](https://github.com/Koushikaasha)
* **Tatikonda Sravya** (Roll No: 23881A04C1) - [GitHub](https://github.com/tatikondasravyareddy)
* **Miryala Varshini** (Roll No: 23881A04C5) - [GitHub](https://github.com/varshinimiriyala28-lab)
