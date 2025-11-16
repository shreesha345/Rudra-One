@echo off
echo ========================================
echo Starting Transcription Client
echo ========================================
echo.
echo This will connect to the server at localhost:8080
echo Make sure the server is running first!
echo.
echo Press Ctrl+C to stop the client
echo ========================================
echo.

timeout /t 2 /nobreak >nul
uv run client.py
