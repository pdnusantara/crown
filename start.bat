@echo off
title BarberOS - Launcher
color 0A

net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  =============================================
echo   BARBEROS - MENJALANKAN APLIKASI
echo  =============================================
echo.

:: ── Set path Docker yang benar ───────────────────
set DOCKER="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
set PATH=C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\Docker\cli-plugins;%PATH%

:: ── Cek Docker Desktop berjalan ──────────────────
echo [1/4] Mengecek Docker Desktop...
%DOCKER% info >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [!] Docker Desktop belum berjalan!
    echo  Buka Docker Desktop dari Start Menu lalu coba lagi.
    echo.
    echo  Atau jalankan: start-no-docker.bat
    pause
    exit /b 1
)
echo [OK] Docker Desktop berjalan.

:: ── Start PostgreSQL ──────────────────────────────
echo [2/4] Menjalankan PostgreSQL (port 5433)...
%DOCKER% start barberos-db >nul 2>&1
if errorlevel 1 (
    echo  Container belum ada. Jalankan setup.bat terlebih dahulu!
    pause
    exit /b 1
)
echo [OK] PostgreSQL berjalan.
timeout /t 3 /nobreak >nul

:: ── Start Backend ─────────────────────────────────
echo [3/4] Menjalankan Backend API...
start "BarberOS - Backend (port 3001)" cmd /k "cd /d D:\crown\backend && color 0B && echo  BarberOS Backend - http://localhost:3001 && echo. && npm run dev"
timeout /t 4 /nobreak >nul

:: ── Start Frontend ────────────────────────────────
echo [4/4] Menjalankan Frontend...
start "BarberOS - Frontend (port 5173)" cmd /k "cd /d D:\crown && color 0D && echo  BarberOS Frontend - http://localhost:5173 && echo. && npm run dev"
timeout /t 5 /nobreak >nul

:: ── Buka Browser ──────────────────────────────────
start http://localhost:5173

echo.
echo  =============================================
echo   BARBEROS BERJALAN!
echo  =============================================
echo.
echo   Frontend  : http://localhost:5173
echo   Backend   : http://localhost:3001
echo.
echo   Super Admin  : admin@barberos.com      / Admin123!
echo   Tenant Admin : admin@barberkingdom.com / Admin123!
echo   Kasir        : kasir@barberkingdom.com / Kasir123!
echo   Barber       : budi@barberkingdom.com  / Barber123!
echo.
echo   Tekan ENTER untuk menutup launcher ini.
pause >nul
