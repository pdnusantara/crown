@echo off
title BarberOS - Stop
color 0C

net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  =============================================
echo   BARBEROS - MENGHENTIKAN SEMUA LAYANAN
echo  =============================================
echo.

:: ── Stop proses Node.js (backend + frontend) ────
echo [1/2] Menghentikan proses Node.js...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo     Tidak ada proses Node.js yang berjalan.
) else (
    echo [OK] Proses Node.js dihentikan.
)

:: ── Stop PostgreSQL ──────────────────────────────
echo [2/2] Menghentikan PostgreSQL...
docker stop barberos-db >nul 2>&1
if errorlevel 1 (
    echo     Container tidak berjalan atau tidak ditemukan.
) else (
    echo [OK] PostgreSQL dihentikan.
)

echo.
echo  =============================================
echo   SEMUA LAYANAN DIHENTIKAN
echo  =============================================
echo.
pause
