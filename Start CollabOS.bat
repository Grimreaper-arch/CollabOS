@echo off
title CollabOS Launcher
cd /d "%~dp0"

echo.
echo   ==========================================
echo            Starting CollabOS...
echo   ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo   Node.js is not installed.
    echo   Opening the download page - install the LTS version, then run this again.
    start "" https://nodejs.org
    pause
    exit /b 1
)

rem Already running? Just open the browser.
node backend\scripts\wait-for.js http://localhost:5000/api/health 1 >nul 2>nul
if not errorlevel 1 (
    node backend\scripts\wait-for.js http://localhost:5173 1 >nul 2>nul
    if not errorlevel 1 (
        echo   CollabOS is already running. Opening browser...
        start "" http://localhost:5173
        timeout /t 3 >nul
        exit /b 0
    )
)

rem First run: install packages.
if not exist "backend\node_modules" (
    echo   Installing backend packages (first run only, may take a minute^)...
    pushd backend
    call npm install
    popd
)
if not exist "client\node_modules" (
    echo   Installing frontend packages (first run only, may take a minute^)...
    pushd client
    call npm install
    popd
)

rem Make sure the database connection is set up (asks for it on first run).
pushd backend
node scripts\setup-db.js
if errorlevel 1 (
    popd
    pause
    exit /b 1
)
popd

echo   Starting the server and the website (in minimized windows)...
start "CollabOS API" /min /d "%~dp0backend" cmd /k npm run dev
start "CollabOS Web" /min /d "%~dp0client" cmd /k npm run dev

echo   Waiting for the server...
node backend\scripts\wait-for.js http://localhost:5000/api/health 60
if errorlevel 1 (
    echo.
    echo   The server did not start. Click "CollabOS API" in the taskbar to see the error.
    echo   If it is a database error, run "Change Database.bat".
    pause
    exit /b 1
)

echo   Waiting for the website...
node backend\scripts\wait-for.js http://localhost:5173 60
if errorlevel 1 (
    echo.
    echo   The website did not start. Click "CollabOS Web" in the taskbar to see the error.
    pause
    exit /b 1
)

start "" http://localhost:5173
echo.
echo   CollabOS is running at http://localhost:5173
echo   To shut it down, double-click "Stop CollabOS.bat".
echo.
timeout /t 6 >nul
exit /b 0
