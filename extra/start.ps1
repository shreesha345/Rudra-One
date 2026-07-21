# RudraOne Startup Script
# This script sets up and runs the entire RudraOne application

Write-Host "🚀 RudraOne Startup Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-Command {
    param($Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

# Check prerequisites
Write-Host "✅ Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Command "python")) {
    Write-Host "❌ Python is not installed. Please install Python 3.12 or higher." -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "node")) {
    Write-Host "❌ Node.js is not installed. Please install Node.js." -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "docker")) {
    Write-Host "❌ Docker is not installed. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "✅ All prerequisites are installed!" -ForegroundColor Green
Write-Host ""

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating from template..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Created .env file. Please edit it with your API keys." -ForegroundColor Green
        Write-Host "   Required: DEEPGRAM_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, etc." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter after you've configured .env file"
    } else {
        Write-Host "❌ .env.example not found. Please create .env manually." -ForegroundColor Red
        exit 1
    }
}

# Start PostgreSQL with Docker
Write-Host "🐘 Starting PostgreSQL database..." -ForegroundColor Cyan
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start PostgreSQL. Please check Docker." -ForegroundColor Red
    exit 1
}
Write-Host "✅ PostgreSQL started successfully!" -ForegroundColor Green
Write-Host ""

# Wait for PostgreSQL to be ready
Write-Host "⏳ Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
Write-Host "✅ PostgreSQL is ready!" -ForegroundColor Green
Write-Host ""

# Setup Python backend
Write-Host "🐍 Setting up Python backend..." -ForegroundColor Cyan

# Check if uv is installed
if (-not (Test-Command "uv")) {
    Write-Host "⚠️  UV is not installed. Installing UV..." -ForegroundColor Yellow
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install UV. Please install manually." -ForegroundColor Red
        exit 1
    }
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

# Install Python dependencies
Write-Host "📦 Installing Python dependencies with UV..." -ForegroundColor Yellow
uv sync
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install Python dependencies." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Python dependencies installed!" -ForegroundColor Green
Write-Host ""

# Setup Frontend
Write-Host "⚛️  Setting up Frontend..." -ForegroundColor Cyan
Set-Location frontend

# Install Node dependencies
Write-Host "📦 Installing Node dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install Node dependencies." -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "✅ Node dependencies installed!" -ForegroundColor Green
Write-Host ""

Set-Location ..

# Initialize database
Write-Host "💾 Initializing database..." -ForegroundColor Cyan
Write-Host "   Database will be created automatically on first run." -ForegroundColor Yellow
Write-Host ""

# Start the application
Write-Host "🎯 Starting RudraOne Application..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Create job objects to track processes
$jobs = @()

# Start Backend
Write-Host "🔥 Starting Backend Server (Port 8000)..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    uv run python server.py
}
$jobs += $backendJob
Write-Host "✅ Backend started in background!" -ForegroundColor Green
Write-Host ""

# Wait a bit for backend to initialize
Start-Sleep -Seconds 3

# Start Frontend
Write-Host "⚛️  Starting Frontend Dev Server (Port 5173)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    Set-Location "$using:PWD\frontend"
    npm run dev
}
$jobs += $frontendJob
Write-Host "✅ Frontend started in background!" -ForegroundColor Green
Write-Host ""

Write-Host "=====================================" -ForegroundColor Green
Write-Host "🎉 RudraOne is now running!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""
Write-Host "📱 Frontend:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "🔧 Backend:   http://localhost:8000" -ForegroundColor Cyan
Write-Host "🐘 Database:  localhost:5432" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Logs:" -ForegroundColor Yellow
Write-Host "   Backend:  Receive-Job -Id $($backendJob.Id) -Keep" -ForegroundColor Gray
Write-Host "   Frontend: Receive-Job -Id $($frontendJob.Id) -Keep" -ForegroundColor Gray
Write-Host ""
Write-Host "⏹️  Press Ctrl+C to stop all services" -ForegroundColor Red
Write-Host ""

# Wait for user to press Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
        
        # Check if jobs are still running
        foreach ($job in $jobs) {
            if ($job.State -eq 'Failed' -or $job.State -eq 'Stopped') {
                Write-Host "⚠️  A service has stopped. Check logs for details." -ForegroundColor Yellow
            }
        }
    }
} finally {
    Write-Host ""
    Write-Host "🛑 Stopping RudraOne..." -ForegroundColor Yellow
    
    # Stop all jobs
    $jobs | Stop-Job
    $jobs | Remove-Job -Force
    
    # Stop Docker services
    Write-Host "🐘 Stopping PostgreSQL..." -ForegroundColor Yellow
    docker-compose down
    
    Write-Host "✅ All services stopped!" -ForegroundColor Green
}
