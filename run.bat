@echo off
title BookKeeping Launcher
set ELECTRON_RUN_AS_NODE=

if exist "%~dp0release\BookKeeping.exe" (
    echo Opening BookKeeping.exe...
    start "" "%~dp0release\BookKeeping.exe"
    exit /b 0
)

echo Checking for Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install it from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    call npm install --no-audit --no-fund
)

echo Building and starting BookKeeping...
call npm run local
pause
