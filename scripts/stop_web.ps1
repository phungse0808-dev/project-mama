# หยุดเซิร์ฟเวอร์ของระบบเฝ้าระวังคุณภาพอากาศ
#
# หยุดเฉพาะ Python ของโปรเจคนี้ ไม่กระทบ Python ตัวอื่นในเครื่อง
# และไม่กระทบการเก็บข้อมูลอัตโนมัติ ซึ่งทำงานแยกผ่าน Task Scheduler

$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "backend\.venv\Scripts\python.exe"

$stopped = 0
Get-Process python -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $python } |
    ForEach-Object {
        Stop-Process -Id $_.Id -Force
        $stopped++
    }

if ($stopped -gt 0) {
    Write-Host "หยุดเซิร์ฟเวอร์แล้ว ($stopped โปรเซส)"
} else {
    Write-Host "ไม่พบเซิร์ฟเวอร์ที่กำลังทำงาน"
}

Write-Host "การเก็บข้อมูลอัตโนมัติทุกชั่วโมงยังทำงานต่อตามปกติ"
Start-Sleep -Seconds 2
