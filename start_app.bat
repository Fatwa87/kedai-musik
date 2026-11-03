@echo off
title Kedai Musik - Pemutar Musik YouTube Bebas Iklan
color 0B
cls
echo ======================================================================
echo           KEDAI MUSIK - PEMUTAR MUSIK YOUTUBE BEBAS IKLAN
echo ======================================================================
echo.
echo Sedang memeriksa dan menyalakan server...
echo.

start "" "http://localhost:5500"
python app.py

pause
