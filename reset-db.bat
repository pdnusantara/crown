@echo off
title BarberOS - Reset Database
color 0C

net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  =============================================
echo   BARBEROS - RESET DATABASE
echo  =============================================
echo.
echo  PERINGATAN: Semua data akan DIHAPUS!
echo  Database akan dikembalikan ke data awal (seed).
echo.
set /p confirm="Ketik YES untuk lanjutkan: "
if /i not "%confirm%"=="YES" (
    echo Dibatalkan.
    pause
    exit /b 0
)

echo.
echo [1/3] Memastikan PostgreSQL berjalan...
docker start barberos-db >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/3] Reset dan migrasi ulang database...
cd /d "%~dp0backend"
call npx prisma migrate reset --force
if errorlevel 1 (
    echo [!] Reset gagal!
    pause
    exit /b 1
)

echo [3/3] Mengisi data awal (seed)...
call npm run db:seed
if errorlevel 1 (
    echo [!] Seed gagal!
    pause
    exit /b 1
)

echo.
echo  =============================================
echo   DATABASE BERHASIL DIRESET!
echo  =============================================
echo.
echo  Jalankan start.bat untuk memulai aplikasi.
echo.
pause
