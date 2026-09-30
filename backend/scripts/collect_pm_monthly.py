"""ดึงค่าฝุ่นรายเดือนย้อนหลังรายจังหวัด จากคลังข้อมูล CAMS ผ่าน Open-Meteo

ใช้ทำอะไร
    ไฟล์ data/disease/pm_monthly.csv เป็นค่าฝุ่นฝั่งซ้ายของการวิเคราะห์ฝุ่นกับผู้ป่วย
    ต้องมีเดือนครบเท่ากับข้อมูลผู้ป่วย ไม่งั้นเดือนที่ขาดจะหลุดออกจากการวิเคราะห์ไปเฉย ๆ
    สคริปต์นี้เติมเฉพาะเดือนที่ยังไม่มีในไฟล์ ของเดิมไม่ถูกแตะ

ทำไมต้องใช้ CAMS ไม่ใช้ค่าจากสถานีจริง
    สถานีของกรมควบคุมมลพิษเปิดให้เรียกย้อนหลังได้ราว 3 เดือนเท่านั้น
    การวิเคราะห์นี้ต้องการย้อนถึงปี 2565 จึงต้องใช้แบบจำลอง
    ข้อเสียคือ CAMS ประเมินฝุ่นภาคเหนือช่วงฤดูเผาต่ำกว่าความเป็นจริง ต้องเขียนกำกับไว้ทุกครั้ง

พิกัดที่ใช้
    ใช้พิกัดชุดเดียวกับข้อมูลอุตุนิยมวิทยาที่ระบบเก็บไว้ เพื่อให้ค่าฝุ่นกับค่าอากาศ
    ของจังหวัดเดียวกันอ้างถึงจุดเดียวกัน ส่วนสามจังหวัดที่ไม่มีในชุดนั้นใช้พิกัดตัวเมือง
    ตรวจแล้วว่าให้ค่าตรงกับข้อมูลเดิมในไฟล์ทุกหลัก

วิธีใช้:  python -m scripts.collect_pm_monthly <เดือนเริ่ม> <เดือนสุดท้าย>
          เช่น  python -m scripts.collect_pm_monthly 2022-01 2026-09
"""

import csv
import json
import sqlite3
import statistics
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

from app.config import DATA_DIR

OUT = DATA_DIR / "disease" / "pm_monthly.csv"
DB = DATA_DIR / "airquality.db"
COLUMNS = ["province", "ym", "pm25", "hours"]

# สามจังหวัดที่ไม่มีในข้อมูลอุตุนิยมวิทยาของระบบ ใช้พิกัดตัวเมือง
# ตรวจแล้วว่าให้ค่าเดือน 2565-08 ตรงกับที่มีอยู่เดิมในไฟล์ทุกจังหวัด
EXTRA_COORDS = {
    "ระนอง": (9.9658, 98.6348),
    "เพชรบุรี": (13.1119, 99.9406),
    "พังงา": (8.4510, 98.5255),
}

BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# หน่วงระหว่างคำขอ กันโดนต้นทางจำกัดอัตรา 77 จังหวัดยิงรวดเดียวเสี่ยงโดนปฏิเสธ
PAUSE_SECONDS = 0.4


def months(start: str, end: str) -> list[str]:
    out, (y, m) = [], (int(start[:4]), int(start[5:]))
    while f"{y}-{m:02d}" <= end:
        out.append(f"{y}-{m:02d}")
        y, m = (y + (m == 12)), (m % 12) + 1
    return out


def last_day(ym: str) -> str:
    y, m = int(ym[:4]), int(ym[5:])
    ny, nm = (y + (m == 12)), (m % 12) + 1
    from datetime import date, timedelta

    return (date(ny, nm, 1) - timedelta(days=1)).isoformat()


def coordinates() -> dict[str, tuple[float, float]]:
    con = sqlite3.connect(DB)
    coords = {
        province: (round(lat, 4), round(lon, 4))
        for province, lat, lon in con.execute(
            "select province, avg(latitude), avg(longitude) from weatherdaily group by province"
        )
    }
    con.close()
    return {**EXTRA_COORDS, **coords}


def read_existing() -> dict[tuple[str, str], dict]:
    if not OUT.exists():
        return {}
    with OUT.open(encoding="utf-8", newline="") as handle:
        return {(row["province"], row["ym"]): row for row in csv.DictReader(handle)}


def fetch(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    url = (
        f"{BASE_URL}?latitude={lat}&longitude={lon}&hourly=pm2_5"
        f"&start_date={start_date}&end_date={end_date}&timezone=Asia%2FBangkok"
    )
    with urllib.request.urlopen(url, timeout=180) as response:
        return json.load(response)["hourly"]


def monthly(hourly: dict) -> dict[str, tuple[float, int]]:
    """ย่อค่ารายชั่วโมงเป็นค่าเฉลี่ยรายเดือน พร้อมจำนวนชั่วโมงที่มีค่าจริง

    เก็บจำนวนชั่วโมงไว้ด้วยเพราะเดือนที่ได้ค่ามาไม่ครบ ความน่าเชื่อถือต่างกัน
    ผู้ใช้ไฟล์จะกรองออกเองได้ถ้าต้องการ
    """
    grouped = defaultdict(list)
    for stamp, value in zip(hourly["time"], hourly["pm2_5"]):
        if value is not None:
            grouped[stamp[:7]].append(value)
    return {ym: (round(statistics.fmean(v), 1), len(v)) for ym, v in grouped.items() if v}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("ต้องระบุเดือนเริ่มและเดือนสุดท้าย เช่น 2022-01 2026-09")
    start, end = sys.argv[1], sys.argv[2]

    coords = coordinates()
    existing = read_existing()
    wanted = months(start, end)
    print(f"จังหวัด {len(coords)} · ช่วง {start} ถึง {end} ({len(wanted)} เดือน)")

    added = 0
    for index, (province, (lat, lon)) in enumerate(sorted(coords.items()), 1):
        missing = [ym for ym in wanted if (province, ym) not in existing]
        if not missing:
            continue
        try:
            hourly = fetch(lat, lon, f"{missing[0]}-01", last_day(missing[-1]))
        except Exception as error:
            print(f"  {index}/{len(coords)} {province} — ดึงไม่สำเร็จ {type(error).__name__}")
            continue

        got = monthly(hourly)
        for ym in missing:
            if ym not in got:
                continue
            value, hours = got[ym]
            existing[(province, ym)] = {
                "province": province,
                "ym": ym,
                "pm25": value,
                "hours": hours,
            }
            added += 1
        print(f"  {index}/{len(coords)} {province} — เติม {len([y for y in missing if y in got])} เดือน", flush=True)
        time.sleep(PAUSE_SECONDS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        for key in sorted(existing):
            writer.writerow(existing[key])

    print(f"เติมใหม่ {added:,} แถว · ไฟล์มีทั้งหมด {len(existing):,} แถว")


if __name__ == "__main__":
    main()
