@echo off
REM ตั้งโปรเจคบนเครื่องใหม่ รันครั้งเดียวหลัง git clone
REM ทำสามอย่าง  1) ติดตั้งไลบรารี Python  2) ติดตั้งและ build หน้าเว็บ  3) สร้างฐานข้อมูลจากไฟล์ CSV
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

echo === 1/3 ติดตั้งไลบรารี Python ===
cd backend
if not exist ".venv" python -m venv .venv
if errorlevel 1 goto nopython
.venv\Scripts\pip install -q -r requirements.txt
if errorlevel 1 goto failed

echo.
echo === 2/3 ติดตั้งและสร้างหน้าเว็บ ===
cd ..\frontend
call npm install
if errorlevel 1 goto nonode
call npm run build
if errorlevel 1 goto failed

echo.
echo === 3/3 สร้างฐานข้อมูลจากไฟล์ CSV ===
cd ..\backend
.venv\Scripts\python.exe -m scripts.import_weather
.venv\Scripts\python.exe -m scripts.import_hourly
.venv\Scripts\python.exe -m scripts.import_hiv
.venv\Scripts\python.exe -m scripts.collect_disease

echo.
echo ติดตั้งเสร็จแล้ว เปิดเว็บด้วย start_web.bat ได้เลย
pause
exit /b 0

:nopython
echo.
echo ไม่พบ Python บนเครื่องนี้ ติดตั้งจาก https://www.python.org/downloads/ ก่อน
echo ตอนติดตั้งให้ติ๊ก Add Python to PATH ด้วย
pause
exit /b 1

:nonode
echo.
echo ไม่พบ Node.js บนเครื่องนี้ ติดตั้งจาก https://nodejs.org/ ก่อน
pause
exit /b 1

:failed
echo.
echo ติดตั้งไม่สำเร็จ ดูข้อความผิดพลาดด้านบน
pause
exit /b 1
