@echo off
echo Starting AI Novel Writer...

REM Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error installing dependencies. Please check your npm installation.
        pause
        exit /b %errorlevel%
    )
)

REM Kill process on port 8002 if exists
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8002') do (
    echo Killing process with PID %%a occupying port 8002...
    taskkill /f /pid %%a >nul 2>&1
)

echo Starting Kilo-Memory Cyber-Monitor...
start /b cmd /c "npm run monitor"

echo Starting development server...
call npm run dev
pause
