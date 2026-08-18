@echo off
REM ดึงข้อมูลที่ GitHub Actions เก็บไว้ เข้าฐานข้อมูลในเครื่อง
REM ทำสองอย่าง  1) git pull เอาไฟล์ CSV ใหม่ลงมา  2) นำเข้าฐานข้อมูล
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
echo === ดึงข้อมูลใหม่จาก GitHub ===
git pull
if errorlevel 1 goto failed
echo.
echo === นำเข้าฐานข้อมูล ===
cd backend
.venv\Scripts\python.exe -m scripts.import_hourly
if errorlevel 1 goto failed
echo.
echo เสร็จแล้ว เปิดเว็บด้วย start_web.bat ได้เลย
pause
exit /b 0
:failed
echo.
echo ทำงานไม่สำเร็จ ดูข้อความผิดพลาดด้านบน
pause
exit /b 1
