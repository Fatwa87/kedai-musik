---
title: Kedai Musik
emoji: 🎵
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# 🎵 Kedai Musik - Pemutar Musik & Video YouTube Bebas Iklan untuk HP

Aplikasi pemutar musik dan video modern untuk HP (*mobile-first*) yang terhubung langsung ke sumber YouTube. Dirancang khusus untuk memberikan pengalaman mendengarkan musik premium **100% Bebas Iklan (No Ads)**, hemat kuota internet, dan dapat memutar musik di latar belakang (*background playback*) saat layar HP dimatikan atau saat membuka aplikasi lain (WhatsApp, Instagram, dll).

---

## ✨ Fitur-Fitur Utama

1. **🚫 100% Bebas Iklan (Ad-Free Guaranteed)**:
   - Streaming langsung dari server media murni tanpa iklan video, banner, maupun jeda sponsor.
2. **🔍 Pencarian Cepat & Saran Otomatis (*Live Auto-Suggestions*)**:
   - Cari lagu, nama artis, judul lagu, atau video YouTube apa pun secara *real-time*.
   - Tersedia saran otomatis (*autocomplete*) dan riwayat pencarian.
   - Tag pencarian populer untuk akses instan (*Indo Hits, Bernadya, Tulus, Mahalini, Coldplay, dll*).
3. **🎧 Mode Audio (Hemat Kuota) & 🎬 Mode Video**:
   - **Mode Musik**: Streaming audio berkualitas tinggi (*AAC 128kbps / Opus*), menghemat hingga 90% kuota data dan sangat hemat baterai.
   - **Mode Video**: Tonton video klip asli YouTube dengan pemutar video jernih tanpa iklan.
4. **📱 Pemutaran di Latar Belakang (*Background Playback*)**:
   - Terintegrasi dengan **Web MediaSession API**.
   - Musik tetap menyala saat layar HP mati atau saat Anda berpindah aplikasi!
   - Kontrol pemutaran (*Play, Pause, Next, Prev, Cover Art*) muncul di layar kunci (*Lock Screen*) dan bar notifikasi HP.
5. **📲 Dukungan PWA (*Progressive Web App*)**:
   - Dapat dipasang (*Install / Tambahkan ke Layar Utama*) langsung di HP (Android & iOS).
   - Berfungsi seperti aplikasi bawaan (*fullscreen*, ikon di *homescreen*, tanpa bilah alamat browser).
6. **🎤 Lirik Lagu Karaoke (*Synced Lyrics*)**:
   - Menampilkan lirik lagu tersinkronisasi otomatis (*scrolling highlight*) mengikuti ritme lagu.
7. **💤 Pengatur Waktu Tidur (*Sleep Timer*)**:
   - Opsi penghentian otomatis: 15 menit, 30 menit, 45 menit, 60 menit, atau saat lagu saat ini selesai.
8. **📑 Antrean & Riwayat (*Queue & History*)**:
   - Tambahkan lagu ke antrean, putar otomatis lagu berikutnya, acak (*Shuffle*), dan ulangi (*Repeat*).
9. **❤️ Daftar Lagu Favorit**:
   - Simpan lagu-lagu kesukaan Anda dengan menekan ikon hati ❤️. Data tersimpan secara aman di penyimpanan HP.
10. **⬇️ Unduh Lagu ke HP**:
    - Tombol unduh langsung untuk menyimpan file audio ke memori HP Anda.
11. **📷 Buka Cepat dengan QR Code**:
    - Cukup arahkan kamera HP ke layar komputer untuk langsung membuka aplikasi di ponsel Anda!

---

## 🚀 Cara Menjalankan & Membuka di HP

### Langkah 1: Jalankan Server di Komputer / Laptop
Ada dua cara mudah:
- **Cara Praktis**: Cukup klik dua kali (double-click) file **`start_app.bat`**.
- **Atau via Terminal / PowerShell**:
  ```bash
  python app.py
  ```

Saat server menyala, terminal akan menampilkan:
```
============================================================
  [KEDAI MUSIK] PEMUTAR MUSIK YOUTUBE TANPA IKLAN
============================================================
  [PC / Local]   : http://localhost:5500
  [HP / Mobile]  : http://10.140.163.163:5500
============================================================
```
beserta **QR Code** yang siap discan.

---

### Langkah 2: Buka di HP Anda (Android / iPhone)

Aplikasi kini dilengkapi **Cloudflare Tunnel Otomatis**, sehingga dapat diakses di HP Anda **meskipun WiFi kantor mengaktifkan isolasi jaringan (AP Isolation), maupun menggunakan paket data seluler / hotspot**:

1. Buka aplikasi **Kamera HP** Anda, lalu arahkan ke **QR Code** yang tampil di aplikasi (atau di terminal).
2. **Atau** buka browser di HP (**Google Chrome** di Android atau **Safari** di iPhone), lalu buka tautan HTTPS aman yang ditampilkan (contoh: `https://xxx.trycloudflare.com` atau `http://10.140.163.163:5500`).
3. Aplikasi Kedai Musik akan langsung terbuka di layar HP Anda!

---

### Langkah 3: Pasang Sebagai Aplikasi di Layar Utama HP (*PWA*)
Agar aplikasi tampil *full-screen* seperti aplikasi asli Play Store:
- **Di Android (Google Chrome)**:
  - Tekan tombol **"Pasang di HP"** di bagian atas, ATAU
  - Tekan menu titik tiga (⋮) di pojok kanan atas browser > Pilih **"Tambahkan ke Layar Utama"** (*Add to Home Screen*) atau **"Install App"**.
- **Di iPhone (Safari)**:
  - Tekan tombol **Share** (ikon kotak dengan panah ke atas) di bagian bawah > Pilih **"Add to Home Screen"** (*Tambah ke Layar Utama*).

Selesai! Ikon **Kedai Musik** akan muncul di menu aplikasi HP Anda.

---

## ☁️ Cara Deploy ke Cloud (Render.com) - 24 Jam Tanpa Laptop

Aplikasi ini sudah siap untuk di-deploy ke **Render.com** (100% Gratis) sehingga Anda tidak perlu menyalakan laptop sama sekali:

1. **Buat Repository Baru di GitHub**:
   - Buka [github.com/new](https://github.com/new) dan beri nama repository, misalnya: `kedai-musik`.
   - Pilih **Private** atau **Public**, lalu klik **Create repository**.
2. **Push Kode dari Laptop**:
   ```bash
   git remote add origin https://github.com/USERNAME/kedai-musik.git
   git push -u origin main
   ```
3. **Deploy di Render.com**:
   - Buka [dashboard.render.com](https://dashboard.render.com/) dan login menggunakan akun GitHub Anda.
   - Klik **New +** > Pilih **Web Service**.
   - Pilih repository **kedai-musik** yang tadi dibuat.
   - Konfigurasi:
     - **Runtime**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `gunicorn -w 1 --threads 8 --timeout 120 -b 0.0.0.0:$PORT app:app`
     - **Plan**: `Free`
   - Klik **Create Web Service**.
4. **Selesai!**
   Render akan memberikan tautan HTTPS permanen (contoh: `https://kedai-musik.onrender.com`). Anda bisa membuka dan meng-install aplikasi tersebut di HP Anda kapan saja tanpa laptop menyala.

---

## ⚠️ Catatan Penting untuk Vercel / Cloud

YouTube sering memblokir IP datacenter (Vercel, Render, Hugging Face) dengan pesan
*“Sign in to confirm you're not a bot”*. Aplikasi ini sudah otomatis:

- Memutar langsung dari CDN Google (tanpa proxy) agar mulai instan.
- Beralih ke pemutar YouTube (`iframe`) dengan cepat bila server cloud diblokir,
  supaya tidak berputar di spinner terlalu lama.

Agar tetap **100% bebas iklan** di Vercel, tambahkan cookies YouTube milik Anda:

1. Login ke YouTube di browser, lalu ekspor cookies memakai ekstensi
   **“Get cookies.txt LOCALLY”** (file `cookies.txt` untuk `youtube.com`).
2. Di dashboard Vercel → **Settings → Environment Variables**, tambahkan salah satu:
   - `YOUTUBE_COOKIES` — isi file `cookies.txt` (disarankan dalam bentuk base64), atau
   - `YOUTUBE_COOKIES_FILE` — path absolut file cookies di server.
3. Base64 di Windows PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt"))
   ```
4. Redeploy. Cookies hanya disimpan sebagai environment variable, **jangan
   di-commit ke GitHub** karena sifatnya setara password akun.

Saat dijalankan di PC sendiri (`start_app.bat`), cookies biasanya tidak diperlukan.

---

## 📁 Struktur Berkas

```
Youtube modren/
├── app.py                     # Backend server Flask, proxy streaming, & integrasi YouTube
├── run.py                     # Skrip pembantu peluncuran
├── start_app.bat              # Peluncur 1-klik untuk Windows
├── requirements.txt           # Daftar pustaka Python
├── templates/
│   └── index.html             # Tampilan aplikasi HP modern (SPA)
├── static/
│   ├── css/
│   │   └── style.css          # Desain antarmuka mobile OLED Dark Glassmorphic
│   ├── js/
│   │   └── app.js             # Logika pemutar, pencarian, lirik, & background playback
│   ├── icons/                 # Ikon PWA & logo resolusi tinggi
│   ├── manifest.json          # Konfigurasi PWA mobile
│   └── sw.js                  # Service Worker untuk caching cepat
└── test_app.py                # Skrip pengujian otomatis seluruh endpoint
```

Nikmati pengalaman mendengarkan musik YouTube favorit Anda tanpa gangguan iklan di mana saja! 🎶

