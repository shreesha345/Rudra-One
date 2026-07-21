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

3. **Google Gemini** (AI Assistant)
   - Sign up: https://ai.google.dev/
   - Get API key

4. **Sarvam AI** (Text-to-Speech for Indian Languages)
   - Sign up: https://www.sarvam.ai/
   - Get API key

5. **Mapbox** (Maps & Geocoding)
   - Sign up: https://www.mapbox.com/
   - Get access token

## Quick Start

### Option 1: Automated Setup (Recommended)

1. Open PowerShell in the RudraOne directory
2. Run the startup script:
   ```powershell
   .\start.ps1
   ```

The script will:
- Check all prerequisites
- Create `.env` file from template
- Start PostgreSQL database
- Install Python dependencies
- Install Node dependencies
- Initialize the database
- Start backend and frontend servers

### Option 2: Manual Setup

#### 1. Configure Environment Variables

Copy the example environment file:
```powershell
Copy-Item .env.example .env
```

Edit `.env` and add your API keys.

#### 2. Start PostgreSQL

```powershell
docker-compose up -d
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
uv run python server.py
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
- Backend: Look at the terminal where `server.py` is running
- Frontend: Look at browser console (F12) and terminal where `npm run dev` is running
- Database: `docker-compose logs postgres`
