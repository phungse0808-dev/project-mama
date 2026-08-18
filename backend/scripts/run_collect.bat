@echo off
REM Hourly air quality collector - called by Windows Task Scheduler
REM Output is appended to data\collector.log for auditing data completeness
REM PYTHONIOENCODING is required: Thai text cannot be written using the default cp1252 codec
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
".venv\Scripts\python.exe" -m scripts.collect_air >> "data\collector.log" 2>&1
