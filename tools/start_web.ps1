# เปิดเว็บระบบเฝ้าระวังคุณภาพอากาศ
#
# ทำสองอย่าง
#   1. เปิดเซิร์ฟเวอร์แบบซ่อนหน้าต่าง ถ้ายังไม่ได้เปิดอยู่
#   2. เปิดเว็บด้วยเบราว์เซอร์ปกติของเครื่อง
#
# เปิดเป็นเว็บธรรมดา ไม่ใช่หน้าต่างโปรแกรมเฉพาะ ผู้ใช้จึงมีแถบที่อยู่
# กดรีเฟรช บุ๊กมาร์ก และเปิดหลายแท็บได้ตามปกติ
#
# เซิร์ฟเวอร์ตัวเดียวเสิร์ฟทั้งหน้าเว็บและ API เพราะ build หน้าเว็บไว้แล้ว

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv\Scripts\python.exe"
$url = "http://127.0.0.1:8000"

function Test-ServerUp {
    try {
        return (Invoke-RestMethod "$url/api/health" -TimeoutSec 2).status -eq "ok"
    } catch {
        return $false
    }
}

if (-not (Test-Path $python)) {
    Write-Host "ไม่พบ Python ของโปรเจคที่ $python" -ForegroundColor Red
    Write-Host "ต้องติดตั้ง dependencies ก่อน ดูวิธีใน README.md"
    Read-Host "กด Enter เพื่อปิด"
    exit 1
}

if (Test-ServerUp) {
    Write-Host "เซิร์ฟเวอร์ทำงานอยู่แล้ว"
} else {
    Write-Host "กำลังเปิดเซิร์ฟเวอร์..."
    $env:PYTHONIOENCODING = "utf-8"
    Start-Process -FilePath $python `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000" `
        -WorkingDirectory $backend `
        -WindowStyle Hidden

    $ready = $false
    foreach ($attempt in 1..40) {
        Start-Sleep -Milliseconds 500
        if (Test-ServerUp) { $ready = $true; break }
    }

    if (-not $ready) {
        Write-Host "เซิร์ฟเวอร์ไม่ตอบสนองภายใน 20 วินาที" -ForegroundColor Red
        Read-Host "กด Enter เพื่อปิด"
        exit 1
    }
    Write-Host "เซิร์ฟเวอร์พร้อมแล้ว"
}

# เปิดเป็นหน้าต่างใหม่ของเบราว์เซอร์ เพื่อไม่ให้ไปแทรกเป็นแท็บเล็กๆ
# ปนกับหน้าอื่นที่ผู้ใช้เปิดค้างไว้จนหาไม่เจอ
$browsers = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--new-window", $url
} else {
    # ไม่มี Chrome หรือ Edge ก็เปิดด้วยเบราว์เซอร์ค่าเริ่มต้นของเครื่อง
    Start-Process $url
}

Write-Host "เปิดเว็บที่ $url แล้ว"

# บอกที่อยู่สำหรับเปิดจากมือถือ
#
# เซิร์ฟเวอร์รับจากทุกเครื่องในวงเดียวกันแล้ว แต่ผู้ใช้ต้องรู้ว่าจะพิมพ์อะไร
# เครื่องที่มีหลายการ์ดเครือข่ายจะมีหลายที่อยู่ จึงแสดงทุกอันให้ลองเอง
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress

if ($addresses) {
    Write-Host ""
    Write-Host "เปิดจากมือถือได้ที่ ให้มือถือต่อไวไฟวงเดียวกับเครื่องนี้" -ForegroundColor Cyan
    foreach ($ip in $addresses) {
        Write-Host "    http://${ip}:8000" -ForegroundColor Cyan
    }
    Write-Host ""
    Write-Host "เปิดแล้วกดเมนูของเบราว์เซอร์ เลือกเพิ่มไปยังหน้าจอโฮม จะได้ไอคอนแอป"
    Write-Host "ทุกคนที่ต่อไวไฟวงเดียวกันเปิดได้ และระบบนี้ไม่มีรหัสผ่าน" -ForegroundColor Yellow
    Write-Host ""
}
Start-Sleep -Seconds 2
