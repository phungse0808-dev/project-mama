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

# ดึงข้อมูลที่บอทเก็บไว้ตอนเครื่องนี้ปิด แล้วนำเข้าฐานข้อมูล
#
# ตัวเก็บในเครื่องทำงานเฉพาะตอนเซิร์ฟเวอร์เปิดอยู่ พอปิดเครื่องก็หยุดเก็บ
# ของจริงคือทุกคืนหายไปราวสิบหกถึงสิบเก้าชั่วโมง และเสาร์อาทิตย์เคยหายรวดเดียว 64 ชั่วโมง
#
# บอทบน GitHub เก็บต่อเนื่องตลอดโดยไม่ขึ้นกับเครื่องนี้ แล้ว commit เป็นไฟล์ CSV ไว้
# การดึงมานำเข้าทุกครั้งที่เปิดเว็บจึงปิดช่องว่างได้หมด โดยไม่ต้องจำว่าต้องสั่งเอง
#
# ทั้งสองขั้นตอนล้มเหลวได้โดยไม่หยุดการเปิดเว็บ เพราะข้อมูลเดิมที่มีอยู่ยังใช้ได้
# การเปิดเว็บไม่ได้เลยเพราะเน็ตไม่ติด เป็นผลเสียที่มากกว่าการได้ข้อมูลไม่ครบล่าสุด
Write-Host "กำลังซิงค์ข้อมูลที่เก็บไว้ระหว่างเครื่องนี้ปิด..."

# คำสั่งภายนอกเขียนความคืบหน้าลง stderr เป็นปกติ ถ้าปล่อยให้ Stop ทำงาน
# สคริปต์จะหยุดทั้งที่คำสั่งยังทำงานสำเร็จ จึงผ่อนเป็น Continue เฉพาะช่วงนี้
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    if (Get-Command git -ErrorAction SilentlyContinue) {
        # ดึงมาเก็บไว้ก่อน ยังไม่แตะอะไรในเครื่อง
        git -C $root fetch origin
        if ($?) {
            # เอาเฉพาะโฟลเดอร์ข้อมูลออกมา ไม่ได้ pull ทั้งสาขา
            #
            # ที่ไม่ใช้ pull เพราะสาขาในเครื่องกับบน GitHub แยกทางกันเป็นปกติ
            # ฝั่งเครื่องมี commit งานที่แก้เอง ฝั่งบอทมี commit ข้อมูลใหม่
            # pull แบบ fast-forward จะล้มเหลวทันทีที่ทั้งสองฝั่งมี commit ของตัวเอง
            # ส่วน pull แบบ merge จะสร้าง commit ให้เองทุกครั้งที่เปิดเว็บ
            # ซึ่งไม่ควรเกิดจากสคริปต์ที่รันอัตโนมัติ
            #
            # สคริปต์นี้ต้องการแค่ไฟล์ CSV ไปนำเข้าฐานข้อมูล ไม่ต้องการประวัติ
            # การหยิบเฉพาะโฟลเดอร์เดียวจึงไม่มีทางชนกับงานที่แก้ค้างไว้เลย
            git -C $root checkout origin/main -- backend/data/hourly
            if (-not $?) {
                Write-Host "หยิบไฟล์ข้อมูลใหม่ไม่สำเร็จ จะใช้ไฟล์ที่มีอยู่ในเครื่องแทน" -ForegroundColor Yellow
            }
        } else {
            Write-Host "ติดต่อ GitHub ไม่ได้ จะใช้ไฟล์ที่มีอยู่ในเครื่องแทน" -ForegroundColor Yellow
        }
    } else {
        Write-Host "ไม่พบ git ข้ามขั้นตอนดึงข้อมูลใหม่จาก GitHub" -ForegroundColor Yellow
    }

    $env:PYTHONIOENCODING = "utf-8"
    Push-Location $backend
    try {
        & $python -m scripts.import_hourly
        if (-not $?) {
            Write-Host "นำเข้าข้อมูลไม่สำเร็จ เว็บจะแสดงเท่าที่มีอยู่ในฐานข้อมูล" -ForegroundColor Yellow
        }
    } finally {
        Pop-Location
    }
} finally {
    $ErrorActionPreference = $previousPreference
}

Write-Host ""

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
