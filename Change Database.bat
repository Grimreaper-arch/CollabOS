@echo off
title CollabOS - Change Database
cd /d "%~dp0backend"

if not exist "node_modules" (
    echo   Installing backend packages...
    call npm install
)

node scripts\setup-db.js --change
echo.
echo   If CollabOS is running, run "Stop CollabOS.bat" then "Start CollabOS.bat" to use the new database.
pause
