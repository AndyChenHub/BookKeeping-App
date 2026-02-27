@echo off
echo Starting Business Transaction Digitizer...
echo.
echo Checking for Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install it from https://nodejs.org/
    pause
    exit /b
)

echo Installing dependencies (this may take a minute on first run)...
call npm install --no-audit --no-fund

echo Building and starting the application...
call npm run local

pause
