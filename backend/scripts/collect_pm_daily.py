"""ดึงค่าฝุ่นรายวันย้อนหลังรายจังหวัด จากคลังข้อมูล CAMS ผ่าน Open-Meteo

ใช้ทำอะไร
    กราฟค่าฝุ่นย้อนหลังบนหน้าฝุ่นกับผู้ป่วย เดิมมีค่ารายวันเฉพาะปี 2566
    และเฉพาะ 5 จังหวัดภาคเหนือตอนล่าง ซึ่งเป็นผลพลอยได้จากการวิเคราะห์ครั้งหนึ่ง
    ไม่ได้ตั้งใจให้เป็นขอบเขตของกราฟ สคริปต์นี้ดึงให้ครบทุกจังหวัดและทุกปีที่คลังมี

ทำไมต้องรายวัน ทั้งที่มีค่ารายเดือนอยู่แล้ว
    ค่าเฉลี่ยรายเดือนกลบยอดแหลมของฤดูเผา เดือนที่มีวันทะลุมาตรฐานสิบกว่าวัน
    อาจได้ค่าเฉลี่ยทั้งเดือนไม่ถึงมาตรฐานเลย ทำให้อ่านสถานการณ์จริงไม่ออก

ข้อจำกัดที่ต้องระบุทุกครั้งที่ใช้
    เป็นค่าจากแบบจำลอง ไม่ใช่ค่าที่สถานีตรวจวัดได้
    และแบบจำลองประเมินฝุ่นภาคเหนือช่วงฤดูเผาต่ำกว่าความจริง ตามผลตรวจในบทที่ 3

พิกัดที่ใช้
    ชุดเดียวกับที่ scripts/collect_pm_monthly.py ใช้ เพื่อให้ค่ารายวันกับรายเดือน
    ของจังหวัดเดียวกันอ้างถึงจุดเดียวกัน เทียบกันได้ตรงไปตรงมา

วิธีใช้:  python -m scripts.collect_pm_daily [วันเริ่ม] [วันสุดท้าย]
          เช่น  python -m scripts.collect_pm_daily 2022-08-01 2026-09-30
          ไม่ใส่ จะใช้ช่วงเต็มเท่าที่คลังข้อมูลมี
"""

import csv
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "airquality.db"
OUT = ROOT / "data" / "pm25_daily.csv"

COLUMNS = ["province", "day", "pm25", "hours"]

#: คลังข้อมูลเริ่มมีค่าจริงตั้งแต่ 4 สิงหาคม 2565 ขอก่อนหน้านั้นได้แต่ได้ค่าว่าง
DEFAULT_START = "2022-08-01"
DEFAULT_END = "2026-09-30"

# สามจังหวัดที่ไม่มีในข้อมูลอุตุนิยมวิทยาของระบบ ใช้พิกัดตัวเมือง
# ชุดเดียวกับที่ collect_pm_monthly.py ใช้
EXTRA_COORDS = {
    "ระนอง": (9.9658, 98.6348),
    "เพชรบุรี": (13.1119, 99.9406),
    "พังงา": (8.4510, 98.5255),
}

BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# หน่วงระหว่างคำขอ กันโดนต้นทางจำกัดอัตรา 77 จังหวัดยิงรวดเดียวเสี่ยงโดนปฏิเสธ
PAUSE_SECONDS = 0.4

#: อย่างน้อยกี่ชั่วโมงจึงนับว่าวันนั้นมีข้อมูลพอ วันละ 24 ชั่วโมงเต็ม
MIN_HOURS = 18


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
    """อ่านของเดิมไว้ก่อน จะได้เติมเฉพาะวันที่ยังไม่มี ไม่ต้องดึงซ้ำทั้งก้อน"""
    if not OUT.exists():
        return {}
    with OUT.open(encoding="utf-8", newline="") as handle:
        return {(row["province"], row["day"]): row for row in csv.DictReader(handle)}


def fetch(lat: float, lon: float, start_date: str, end_date: str) -> dict:
    url = (
        f"{BASE_URL}?latitude={lat}&longitude={lon}&hourly=pm2_5"
        f"&start_date={start_date}&end_date={end_date}&timezone=Asia%2FBangkok"
    )
    with urllib.request.urlopen(url, timeout=180) as response:
        return json.load(response)["hourly"]


def daily(hourly: dict) -> dict[str, tuple[float, int]]:
    """ย่อค่ารายชั่วโมงเป็นค่าเฉลี่ยรายวัน พร้อมจำนวนชั่วโมงที่มีค่าจริง

    เก็บจำนวนชั่วโมงไว้ด้วย เพราะวันที่ได้ค่ามาไม่ครบความน่าเชื่อถือต่างกัน
    ผู้ใช้ไฟล์กรองออกเองได้
    """
    bucket: dict[str, list[float]] = defaultdict(list)
    for stamp, value in zip(hourly["time"], hourly["pm2_5"]):
        if value is not None:
            bucket[stamp[:10]].append(value)
    return {
        day: (round(sum(values) / len(values), 1), len(values))
        for day, values in bucket.items()
        if len(values) >= MIN_HOURS
    }


def main() -> None:
    start = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_START
    end = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_END

    coords = coordinates()
    rows = read_existing()
    print(f"จังหวัดที่จะดึง {len(coords)} · ช่วง {start} ถึง {end}")
    print(f"ของเดิมในไฟล์ {len(rows):,} แถว")

    added = 0
    failed: list[str] = []
    for index, (province, (lat, lon)) in enumerate(sorted(coords.items()), 1):
        try:
            hourly = fetch(lat, lon, start, end)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            failed.append(province)
            print(f"  [{index:>2}/{len(coords)}] {province} ดึงไม่สำเร็จ {error}")
            continue

        new_here = 0
        for day, (value, hours) in daily(hourly).items():
            key = (province, day)
            if key in rows:
                continue
            rows[key] = {"province": province, "day": day, "pm25": value, "hours": hours}
            new_here += 1
        added += new_here
        print(f"  [{index:>2}/{len(coords)}] {province} เพิ่ม {new_here} วัน")
        time.sleep(PAUSE_SECONDS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        for key in sorted(rows):
            writer.writerow(rows[key])

    print()
    print(f"เพิ่มใหม่ {added:,} วัน · รวมในไฟล์ {len(rows):,} แถว")
    print(f"ขนาดไฟล์ {OUT.stat().st_size / 1024 / 1024:.1f} MB")
    if failed:
        print(f"ดึงไม่สำเร็จ {len(failed)} จังหวัด รันซ้ำได้ จะเติมเฉพาะที่ขาด: {', '.join(failed)}")


if __name__ == "__main__":
    main()
