@echo off
title CollabOS - Reset Database
cd /d "%~dp0backend"

if not exist "node_modules" (
    echo   Installing backend packages...
    call npm install
)

node scripts\setup-db.js
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo   This ERASES EVERYTHING in the CollabOS database: all accounts, organizations,
echo   projects, tasks, messages and uploaded files. It cannot be undone.
echo.
choice /c YN /m "  Erase everything and start fresh"
if errorlevel 2 (
    echo   Cancelled. Nothing was changed.
    pause
    exit /b 0
)

echo.
call npm run reset --silent
echo.
echo   Done. Open CollabOS and sign up to start fresh.
pause
