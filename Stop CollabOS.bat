@echo off
title Stop CollabOS
echo   Stopping CollabOS...

taskkill /FI "WINDOWTITLE eq CollabOS API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq CollabOS Web*" /T /F >nul 2>nul

rem Anything still listening on the CollabOS ports.
for %%P in (5000 5173) do (
    for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do (
        if not "%%I"=="0" taskkill /PID %%I /T /F >nul 2>nul
    )
)

echo   CollabOS stopped.
timeout /t 3 >nul
