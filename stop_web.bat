@echo off
chcp 65001 >nul
title Stop PM2.5 Air Quality Web
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\stop_web.ps1"
