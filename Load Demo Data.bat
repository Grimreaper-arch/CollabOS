@echo off
title CollabOS - Load Demo Data
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
echo   This ERASES everything in the CollabOS database (all accounts, projects,
echo   tasks and messages) and replaces it with the demo company "Acme Corp".
echo.
choice /c YN /m "  Continue"
if errorlevel 2 (
    echo   Cancelled. Nothing was changed.
    pause
    exit /b 0
)

echo.
call npm run seed --silent -- --reset
echo.
pause
