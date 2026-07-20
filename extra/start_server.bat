@echo off
echo ========================================
echo Starting Voice Phone Call Server
echo ========================================
echo.
echo Make sure you have:
echo 1. Set up your .env file with API keys
echo 2. ngrok installed and in PATH
echo 3. All dependencies installed
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

uv run voice_phone_call_groq.py
