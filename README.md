# 🎙️ AI Mock Interviewer v4.0

![AI Interviewer Hero](https://images.unsplash.com/photo-1573164713988-8665fc963095?q=80&w=2069&auto=format&fit=crop)

A cutting-edge, completely hands-free AI mock interviewing platform designed to simulate high-stakes job interviews at top tech companies. Practice your interview skills with an ultra-realistic, conversational AI that listens, evaluates, and grades your performance in a strict proctored environment.

## ✨ Key Features

- 🗣️ **Hands-Free Conversational AI**: Built-in silence detection automatically knows when you finish speaking and instantly replies. No buttons required.
- 🧠 **Conversational LLM Engine**: Powered by Groq with `openai/gpt-oss-20b` by default. Set `GROQ_MODEL` to use another model available to your account.
- 🎙️ **Ultra-Realistic Neural Voice**: Utilizes Amazon Polly Neural Text-to-Speech (Joanna) for indistinguishable, human-like voice synthesis—100% free with no API keys required.
- 🚨 **Strict Anti-Cheat System**: Built-in proctoring utilizing the Page Visibility API. If a candidate attempts to switch tabs or look up answers, the interview instantly terminates with a "Not Hired" verdict.
- 🏢 **Dynamic Company Personas**: Tailor your interview to specific companies (Google, Meta, Netflix). The AI avatar dynamically changes colors and the AI asks notoriously typical questions for that specific company.
- 📊 **Instant Evaluation**: The AI automatically concludes the interview after 5 questions and generates a comprehensive feedback report with a final "Hired" or "Not Hired" verdict.

## 🛠️ Technologies Used

### Core Stack
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Library**: [React 18](https://react.dev/)
- **Styling**: Vanilla CSS with modern CSS variables, glassmorphism, and dynamic gradients.
- **Icons**: [Lucide React](https://lucide.dev/)

### Artificial Intelligence & APIs
- **Large Language Model**: [Groq API](https://groq.com/) running `openai/gpt-oss-20b` by default (configurable through `GROQ_MODEL`).
- **Text-to-Speech (TTS)**: Amazon Polly Neural TTS via StreamElements Proxy API.
- **Speech-to-Text (STT)**: Native HTML5 Web Speech API (`SpeechRecognition`).

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- A free API key from [Groq](https://console.groq.com/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ai-mock-interviewer.git
   cd ai-mock-interviewer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root of your project and add your Groq API Key:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=openai/gpt-oss-20b
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔒 Permissions & Security
To use the application, you must grant the browser permission to access your **Microphone**. A webcam preview is also provided to simulate a professional environment.

Open the site in Chrome or Edge on HTTPS (or localhost). Microphone permission and speech recognition are checked separately. Listening pauses while the interviewer speaks or processes an answer. If the browser's speech service fails, use **Retry microphone**; permission can remain allowed even when that service is unavailable. An unanswered permission prompt becomes retryable after 15 seconds.

Run microphone lifecycle regression checks with `npm test`.

---
*Built with ❤️ for acing your next big interview.*
