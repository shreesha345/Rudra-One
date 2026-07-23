# RudraOne - Setup Guide

## Prerequisites

Before running RudraOne, ensure you have the following installed:

1. **Python 3.12 or higher**
   - Download from: https://www.python.org/downloads/
   
2. **Node.js 18 or higher**
   - Download from: https://nodejs.org/

3. **Docker Desktop**
   - Download from: https://www.docker.com/products/docker-desktop/

4. **UV (Python Package Manager)**
   - Will be auto-installed by the startup script if not present
   - Manual install: https://docs.astral.sh/uv/

## API Keys Required

You'll need to sign up for and obtain API keys from:

1. **Deepgram** (Speech-to-Text)
   - Sign up: https://deepgram.com/
   - Get free credits

2. **Twilio** (Phone System)
   - Sign up: https://www.twilio.com/
   - Get Account SID, Auth Token, and a Phone Number

3. **OpenAI-compatible LLM API key**
   - Any provider that speaks the OpenAI Chat Completions API works:
     OpenAI, Groq, Together, OpenRouter, DeepSeek, Ollama, LM Studio, vLLM, etc.
   - Set `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` in `.env`

4. **Sarvam AI** (Text-to-Speech for Indian Languages)
   - Sign up: https://www.sarvam.ai/
   - Get API key

5. **Mapbox** (Maps & Geocoding)
   - Sign up: https://www.mapbox.com/
   - Get access token

## Quick Start

### Option 1: Docker (Recommended)

1. Copy the environment file and fill in your API keys:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Start all services:
   ```powershell
   docker compose up -d --build
   ```
   This starts PostgreSQL, the backend (FastAPI), and a Cloudflare tunnel.

### Option 2: Manual Setup

#### 1. Configure Environment Variables

Copy the example environment file:
```powershell
Copy-Item .env.example .env
```

The single root `.env` file is shared by both backend and frontend.

#### 2. Start PostgreSQL

```powershell
docker compose up -d postgres
```

#### 3. Install Python Dependencies

```powershell
uv sync
```

#### 4. Install Frontend Dependencies

```powershell
cd frontend
npm install
cd ..
```

#### 5. Start Backend

```powershell
uv run python -m backend.main
```

#### 6. Start Frontend (in a new terminal)

```powershell
cd frontend
npm run dev
```

## Access the Application

Once running, access:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Database**: localhost:5432

## Default Login

- Username: `admin`
- Password: `admin123`

## Troubleshooting

### PostgreSQL Connection Issues
- Ensure Docker is running
- Check if port 5432 is available
- Restart Docker containers: `docker-compose restart`

### Backend Issues
- Check `.env` file has all required API keys
- Verify Python version: `python --version`
- Check logs in the terminal

### Frontend Issues
- Clear node_modules and reinstall: `rm -rf node_modules; npm install`
- Clear browser cache
- Check if port 5173 is available

### Database Not Initializing
- The database tables are created automatically on first run
- If issues persist, stop all services and delete Docker volumes:
  ```powershell
  docker-compose down -v
  docker-compose up -d
  ```

## Stopping the Application

### If using start.ps1
Press `Ctrl+C` in the PowerShell window where the script is running.

### If running manually
1. Stop backend: Press `Ctrl+C` in backend terminal
2. Stop frontend: Press `Ctrl+C` in frontend terminal
3. Stop database: `docker-compose down`

## Development Notes

- Backend runs on port 8000
- Frontend runs on port 5173
- PostgreSQL runs on port 5432
- WebSocket connections use the same port as backend (8000)

## Need Help?

Check the logs:
- Backend: Look at the terminal where `backend.main` is running
- Frontend: Look at browser console (F12) and terminal where `npm run dev` is running
- Database: `docker-compose logs postgres`
