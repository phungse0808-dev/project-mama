"""นำไฟล์ CSV รายชั่วโมงที่ GitHub Actions เก็บไว้ เข้าสู่ฐานข้อมูลในเครื่อง

ใช้คู่กับ scripts/collect_to_csv.py ซึ่งรันบน GitHub Actions
    GitHub Actions  ดึงข้อมูล → เขียน CSV → commit เข้า repo
    เครื่องนี้       git pull → สคริปต์นี้ → ฐานข้อมูล → เว็บอ่านไปแสดง

ฐานข้อมูลจึงไม่ต้องขึ้น git เลย สร้างใหม่จาก CSV ได้ตลอดเวลา
ซึ่งเป็นข้อดีด้านการตรวจสอบย้อนกลับด้วย เพราะ CSV คือหลักฐานว่าได้ค่าอะไรมาเมื่อไร

รันซ้ำได้ปลอดภัย ค่าที่นำเข้าแล้วจะถูกข้าม ไม่บันทึกซ้ำ

วิธีใช้:  python -m scripts.import_hourly
"""

import csv
from datetime import datetime

from sqlmodel import Session, select

from app.config import DATA_DIR
from app.db import create_db_and_tables, engine
from app.models import Reading, Station

HOURLY_DIR = DATA_DIR / "hourly"
STATIONS_FILE = DATA_DIR / "stations.csv"


def number(text: str) -> float | None:
    """ช่องว่างใน CSV หมายถึงไม่มีค่า ไม่ใช่ศูนย์"""
    text = (text or "").strip()
    return float(text) if text else None


def import_stations(session: Session) -> int:
    """เพิ่มสถานีใหม่ และอัปเดตรายละเอียดสถานีเดิมที่เปลี่ยนไป"""
    if not STATIONS_FILE.exists():
        return 0

    existing = {s.station_code: s for s in session.exec(select(Station)).all()}
    added = 0

    with STATIONS_FILE.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            code = row["station_code"]
            station = existing.get(code)
            if station is None:
                station = Station(
                    station_code=code,
                    name_th=row["name_th"],
                    name_en=row["name_en"],
                    area_th=row["area_th"],
                    area_en=row["area_en"],
                    province=row["province"],
                    station_type=row["station_type"],
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                )
                session.add(station)
                existing[code] = station
                added += 1
            else:
                # ชื่อและจังหวัดอาจถูกแก้ที่ต้นทาง จึงอัปเดตตามเสมอ
                station.name_th = row["name_th"]
                station.province = row["province"]
                session.add(station)

    session.commit()
    return added


def import_readings(session: Session) -> tuple[int, int]:
    """นำค่าตรวจวัดเข้าฐานข้อมูล คืนค่า (บันทึกใหม่, ข้ามเพราะมีอยู่แล้ว)"""
    station_ids = {s.station_code: s.id for s in session.exec(select(Station)).all()}

    # โหลดคู่ (สถานี, เวลา) ที่มีอยู่แล้วมาไว้ในหน่วยความจำครั้งเดียว
    # เร็วกว่าการสั่งค้นฐานข้อมูลทีละแถวมาก เมื่อไฟล์สะสมเป็นพันไฟล์
    seen = set(session.exec(select(Reading.station_id, Reading.measured_at)).all())

    new = 0
    skipped = 0

    for path in sorted(HOURLY_DIR.rglob("*.csv")):
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                station_id = station_ids.get(row["station_code"])
                if station_id is None:
                    continue

                measured_at = datetime.fromisoformat(row["measured_at"])
                if (station_id, measured_at) in seen:
                    skipped += 1
                    continue

                session.add(Reading(
                    station_id=station_id,
                    measured_at=measured_at,
                    pm25=number(row["pm25"]),
                    pm10=number(row["pm10"]),
                    o3=number(row["o3"]),
                    co=number(row["co"]),
                    no2=number(row["no2"]),
                    so2=number(row["so2"]),
                    aqi=int(row["aqi"]) if row["aqi"].strip() else None,
                ))
                seen.add((station_id, measured_at))
                new += 1

        # commit ทีละไฟล์ เพื่อไม่ให้ค้างในหน่วยความจำเมื่อไฟล์สะสมมาก
        session.commit()

    return new, skipped


def main() -> None:
    if not HOURLY_DIR.exists():
        raise SystemExit(f"ยังไม่มีโฟลเดอร์ {HOURLY_DIR} — สั่ง git pull ก่อน")

    files = list(HOURLY_DIR.rglob("*.csv"))
    create_db_and_tables()

    with Session(engine) as session:
        stations_added = import_stations(session)
        new, skipped = import_readings(session)

    print(f"อ่านไฟล์ {len(files)} ไฟล์")
    print(f"สถานีใหม่ {stations_added}")
    print(f"ค่าตรวจวัด บันทึกใหม่ {new}  มีอยู่แล้ว(ข้าม) {skipped}")


if __name__ == "__main__":
    main()
