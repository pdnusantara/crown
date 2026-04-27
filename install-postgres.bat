@echo off
title BarberOS - Install PostgreSQL
color 0B

net session >nul 2>&1
if errorlevel 1 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo  =============================================
echo   INSTALL POSTGRESQL (Tanpa Docker)
echo  =============================================
echo.

:: ── Cek apakah PostgreSQL sudah terinstall ──────
psql --version >nul 2>&1
if not errorlevel 1 (
    echo [OK] PostgreSQL sudah terinstall!
    echo      Langsung jalankan: setup-no-docker.bat
    echo.
    pause
    exit /b 0
)

:: ── Coba install via winget ──────────────────────
echo [1/2] Mencoba install PostgreSQL via winget...
winget --version >nul 2>&1
if not errorlevel 1 (
    echo     Menginstall PostgreSQL 16...
    winget install -e --id PostgreSQL.PostgreSQL.16 --accept-source-agreements --accept-package-agreements
    if not errorlevel 1 (
        echo.
        echo [OK] PostgreSQL berhasil diinstall!
        echo.
        echo  PENTING: Restart komputer atau buka CMD baru
        echo  agar PostgreSQL bisa dideteksi.
        echo.
        echo  Setelah restart, jalankan: setup-no-docker.bat
        echo  Gunakan password yang Anda set saat instalasi.
        echo.
        pause
        exit /b 0
    )
)

:: ── Fallback: download installer manual ─────────
echo.
echo [2/2] Membuka halaman download PostgreSQL...
echo.
echo  winget tidak tersedia atau gagal.
echo  Silakan download PostgreSQL secara manual:
echo.
echo  1. Buka link ini di browser:
echo     https://www.postgresql.org/download/windows/
echo.
echo  2. Klik "Download the installer"
echo.
echo  3. Pilih versi 16.x untuk Windows x86-64
echo.
echo  4. Jalankan installer dengan pengaturan:
echo     - Password  : barberos123
echo     - Port      : 5432
echo     - Locale    : Default
echo.
echo  5. Setelah install selesai, jalankan:
echo     setup-no-docker.bat
echo.
start https://www.postgresql.org/download/windows/
pause
