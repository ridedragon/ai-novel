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

echo Starting development server...
call npm run dev
pause
