@echo off
title Push Kedai Musik ke GitHub
chcp 65001 >nul
echo =======================================================
echo   🚀 PUSH KEDAI MUSIK KE GITHUB
echo =======================================================
echo.
echo Langkah awal:
echo 1. Buka browser: https://github.com/new
echo 2. Beri nama repository: kedai-musik
echo 3. Pilih Public atau Private, lalu klik 'Create repository'
echo.
set /p repo_url="Masukkan URL Repository GitHub Anda (contoh: https://github.com/Fatwa87/kedai-musik.git): "

if "%repo_url%"=="" (
    echo [!] URL tidak boleh kosong!
    pause
    exit /b
)

git remote remove origin 2>nul
git remote add origin %repo_url%
git branch -M main
echo.
echo Mengunggah kode ke GitHub...
git push -u origin main

echo.
echo =======================================================
if %errorlevel% equ 0 (
    echo ✅ SUKSES! Kode berhasil diunggah ke GitHub.
    echo Sekarang Anda bisa buka https://dashboard.render.com untuk Deploy!
) else (
    echo ℹ️ Jika diminta login GitHub, silakan selesaikan login di browser.
)
echo =======================================================
pause

