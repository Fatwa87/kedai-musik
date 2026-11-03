@echo off
title Push Kedai Musik ke Hugging Face Spaces
chcp 65001 >nul
echo =======================================================
echo   🚀 UPLOAD KEDAI MUSIK KE HUGGING FACE SPACES
echo =======================================================
echo.
echo Untuk mengunggah ke Hugging Face Space Anda:
echo 1. Buka link ini di browser:
echo    https://huggingface.co/settings/tokens
echo.
echo 2. Klik tombol "Create new token" (atau "New token")
echo 3. Beri nama (misal: "kedai-musik") dan pilih tipe "Write"
echo 4. Klik "Create token", lalu Copy / Salin tokennya (awalan hf_...)
echo.
set /p hf_token="Paste Token Hugging Face Anda di sini (hf_...): "

if "%hf_token%"=="" (
    echo [!] Token tidak boleh kosong!
    pause
    exit /b
)

echo.
echo Menghubungkan ke https://huggingface.co/spaces/fatwaloebis/kedai-musik ...
git remote remove hf 2>nul
git remote add hf https://fatwaloebis:%hf_token%@huggingface.co/spaces/fatwaloebis/kedai-musik
git branch -M main

echo.
echo Sedang mengunggah file ke Hugging Face...
git push -f hf main

echo.
echo =======================================================
if %errorlevel% equ 0 (
    echo ✅ SUKSES BESAR! Kode berhasil terunggah ke Hugging Face!
    echo.
    echo Buka halaman Space Anda:
    echo 👉 https://huggingface.co/spaces/fatwaloebis/kedai-musik
    echo.
    echo Hugging Face sedang otomatis membangun server Anda (Building).
    echo Dalam 1-2 menit statusnya akan "Running", dan Anda bisa buka di HP!
) else (
    echo ❌ Gagal mengunggah. Pastikan Token yang dimasukkan memiliki izin 'Write'.
)
echo =======================================================
pause
