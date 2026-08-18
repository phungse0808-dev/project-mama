"""ดึงข้อมูล Air4Thai หนึ่งรอบแล้วเขียนเป็นไฟล์ CSV — สคริปต์นี้รันบน GitHub Actions

ทำไมไม่ใช้ scripts/collect_air.py ที่มีอยู่แล้ว
    ตัวนั้นเขียนลงฐานข้อมูล SQLite โดยตรง ซึ่งใช้บน GitHub Actions ไม่ได้
    เพราะเครื่องที่ GitHub ให้ยืมถูกลบทิ้งทั้งเครื่องหลังรันจบ ไฟล์ฐานข้อมูล
    จึงหายไปด้วย ต้องส่งผลกลับมาเก็บที่ repo แทน

ทำไมเป็น CSV ไม่ใช่ JSON ดิบ
    JSON ดิบรอบละ 140 KB ถ้า commit ทุกชั่วโมงจะสะสมราว 300 MB ใน 3 เดือน
    CSV ที่เก็บเฉพาะค่าที่ใช้จริงเหลือรอบละ ~10 KB หรือราว 20 MB ในช่วงเดียวกัน

ทำไมเขียนไฟล์ใหม่ทุกชั่วโมง ไม่ต่อท้ายไฟล์เดิม
    git เก็บไฟล์ใหม่ทั้งก้อนทุกครั้งที่ไฟล์เปลี่ยน ถ้าต่อท้ายไฟล์เดิมที่โตขึ้นเรื่อยๆ
    จะเสียพื้นที่แบบทวีคูณ ไฟล์ใหม่ที่เขียนครั้งเดียวแล้วไม่แก้อีก git เก็บครั้งเดียวจบ

วิธีใช้:  python -m scripts.collect_to_csv
"""

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.air4thai import POLLUTANTS, fetch_raw, parse_measured_at, parse_province, to_float, to_int
from app.config import DATA_DIR

# Air4Thai รายงานเวลาเป็นเวลาไทย และระบบเก็บ measured_at เป็นเวลาไทยทั้งหมด
# ชื่อโฟลเดอร์กับชื่อไฟล์จึงต้องเป็นเวลาไทยด้วย ไม่งั้นจะอ่านสับสน
#
# เรื่องนี้สำคัญเพราะเครื่องของ GitHub ตั้งเป็น UTC ถ้าใช้เวลาเครื่องตรงๆ
# ช่วงเที่ยงคืนถึง 6:59 น. เวลาไทย วันที่ UTC จะยังเป็นเมื่อวาน
# ไฟล์ของวันใหม่จะไปตกอยู่ในโฟลเดอร์ของวันก่อนหน้า
THAI_TIME = timezone(timedelta(hours=7))

HOURLY_DIR = DATA_DIR / "hourly"
STATIONS_FILE = DATA_DIR / "stations.csv"

READING_COLUMNS = ["measured_at", "station_code", "pm25", "pm10", "o3", "co", "no2", "so2", "aqi"]
STATION_COLUMNS = [
    "station_code", "name_th", "name_en", "area_th", "area_en",
    "province", "station_type", "latitude", "longitude",
]


def extract(payload: dict) -> tuple[list[dict], list[dict]]:
    """แยกข้อมูลดิบออกเป็นสองส่วน ค่าตรวจวัด และรายละเอียดสถานี"""
    readings: list[dict] = []
    stations: list[dict] = []

    for raw in payload.get("stations", []):
        code = (raw.get("stationID") or "").strip()
        latitude = to_float(raw.get("lat"))
        longitude = to_float(raw.get("long"))
        if not code or latitude is None or longitude is None:
            continue

        area_th = raw.get("areaTH") or ""
        stations.append({
            "station_code": code,
            "name_th": (raw.get("nameTH") or "").strip(),
            "name_en": (raw.get("nameEN") or "").strip(),
            "area_th": area_th,
            "area_en": raw.get("areaEN") or "",
            "province": parse_province(area_th),
            "station_type": raw.get("stationType") or "",
            "latitude": latitude,
            "longitude": longitude,
        })

        aqi_last = raw.get("AQILast") or {}
        measured_at = parse_measured_at(aqi_last)
        if measured_at is None:
            continue

        row = {"measured_at": measured_at.isoformat(), "station_code": code}
        for key in POLLUTANTS:
            row[key.lower().replace("pm25", "pm25")] = to_float((aqi_last.get(key) or {}).get("value"))
        row["aqi"] = to_int((aqi_last.get("AQI") or {}).get("aqi"))
        readings.append(row)

    return readings, stations


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    payload = fetch_raw()
    readings, stations = extract(payload)

    if not readings:
        raise SystemExit("ไม่ได้ค่าตรวจวัดเลยสักสถานี ต้นทางอาจมีปัญหา")

    now = datetime.now(THAI_TIME)
    target = HOURLY_DIR / now.strftime("%Y-%m-%d") / f"{now.strftime('%H%M')}.csv"
    write_csv(target, READING_COLUMNS, readings)

    # เขียนทับไฟล์เดิมทุกรอบ ถ้าเนื้อหาไม่เปลี่ยน git จะไม่นับว่าเป็นการแก้ไข
    # จึงไม่เปลืองพื้นที่ แม้จะเขียนทุกชั่วโมง
    stations.sort(key=lambda item: item["station_code"])
    write_csv(STATIONS_FILE, STATION_COLUMNS, stations)

    print(f"เขียน {target.relative_to(DATA_DIR.parent)} — ค่าตรวจวัด {len(readings)} แถว จาก {len(stations)} สถานี")


if __name__ == "__main__":
    main()
