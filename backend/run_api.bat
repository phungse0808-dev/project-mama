@echo off
chcp 65001 >nul
title API - ระบบเฝ้าระวังคุณภาพอากาศ
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo ============================================
echo   เซิร์ฟเวอร์ API  http://127.0.0.1:8000
echo   ปิดหน้าต่างนี้เพื่อหยุดการทำงาน
echo ============================================
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --reload
pause