@echo off
chcp 65001 >nul
title PM2.5 Air Quality Web
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start_web.ps1"
