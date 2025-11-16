
# RudraOne: AI-Powered 112 Emergency Response Platform

India's first unified, AI-driven 112 emergency platform combining call-taking, dispatch, and field response with multi-language support and real-time situational awareness.

---

## 📋 Problem Statement
India's 112 emergency response system faces critical challenges:
- Fragmented multi-agency systems
- High call volumes and delays
- Language barriers
- Lack of real-time situational awareness
- Manual data tracking and quality assurance

## 💡 Solution
End-to-end AI-driven platform integrating multi-agency operations, advanced language capabilities, and real-time situational awareness. Measurable impact: faster emergency call processing, reduced delays, and lower operator workload.

---

## ✨ Features
- Unified multi-agency interface (police, fire, ambulance)
- Text/SMS to 112 support, AML India integration
- AI-powered speech-to-text, multi-language translation, multi-lingual text-to-speech
- Media-rich support: live video, photo sharing, GPS/What3Words location
- Advanced QA and automated call scoring
- Radio transcription and assistive dispatch
- AI-powered non-emergency triage

---

## 🚀 Main Differences Vs Others
| Feature                    | RudraOne                          | Traditional Systems           |
|---------------------------|-----------------------------------|------------------------------|
| Platform Integration      | Unified interface (all agencies)  | Fragmented systems           |
| Language Support          | 10+ real-time Indian languages    | Limited/manual               |
| Situational Awareness     | Live video, GPS, media, What3Words| Verbal only                  |
| AI Automation             | Triage, transcription, QA, scoring| Manual                       |
| Data Compliance           | Data sovereignty, flexible deploy | Mostly cloud, no sovereignty |
| Non-Emergency Handling    | Automated AI bots                 | Operators only               |

---

## 🛠️ Tech Stack
### Backend:
- Python 3.12+, FastAPI
- Google Gemini, Groq AI
- Deepgram, AssemblyAI, ElevenLabs, Sarvam AI, Twilio, ngrok

### Frontend:
- React/TypeScript, Vite, Mapbox, WebSocket

---

## 📦 Prerequisites
- Python 3.12+
- Node.js 18+ (Corepack-enabled)
- Yarn (managed via Corepack)
- ngrok (optional; for Twilio webhooks)

---

## ⚙️ Setup Instructions
### 1️⃣ Backend Setup (uv)
Use uv for dependency management and running the server. The project declares all dependencies in `pyproject.toml` (including CUDA wheel index for PyTorch).

- Install uv (Windows PowerShell):
  ```powershell
  iwr https://astral.sh/uv/install.ps1 -UseBasicParsing | iex
  ```

- From the repo root, create the environment and install deps:
  ```powershell
  uv sync
  ```

- Create a `.env` file in the repo root (see template below).

- Run the backend (development):
  ```powershell
  uv run python server.py
  ```

#### .env format (do NOT put actual API keys here!)
```
# AI Models
GROQ_API_KEY=your_groq_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# Twilio (console.twilio.com)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Speech Recognition
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# Text-to-Speech
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE=21m00Tcm4TlvDq8ikWAM
SARVAM_API_KEY=your_sarvam_api_key_here

# Directories
RECORDINGS_DIR=recordings
TRANSCRIPTS_DIR=transcripts

# ngrok (optional for local dev)
NGROK_URL=your-subdomain.ngrok-free.app
```

### 2️⃣ Frontend Setup (Yarn)
Use Yarn via Corepack to manage frontend dependencies.

- Enable Yarn with Corepack and install deps:
  ```powershell
  corepack enable
  corepack prepare yarn@stable --activate
  cd frontend
  yarn install
  ```

- Create `.env` in `frontend/` folder:
```
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_API_KEY=your_google_api_key_here
VITE_MAPBOX_TOKEN=your_mapbox_token_here
PORT=8000
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```
- Start the frontend (dev mode):
  ```powershell
  yarn dev
  ```

---

## 🎮 Usage
- Start the backend: `uv run python server.py` (repo root)
- Start the frontend: `yarn dev` (`frontend/`)
- App UI: `http://localhost:5173`
- API: `http://localhost:8000` (Docs at `/docs` in development)
- For Twilio/webhooks, run ngrok and update URLs in `.env`

---

## 📁 Structure
```
RudraOne/
├── server.py
├── pyproject.toml
├── .env (backend)
├── recordings/
├── transcripts/
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── .env (frontend)
│   └── vite.config.ts
└── README.md
```

---

## 🔐 Compliance
- Indian data sovereignty, encrypted comms, integration-friendly, secure by design

## 🤝 Contributing
Submit PRs and issues! All contributors welcome.

## 📄 License
MIT

## 📧 Contact
Reach out to the RudraOne team for support and partnerships.

