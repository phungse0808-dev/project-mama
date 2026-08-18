"""นำข้อมูลอากาศจากไฟล์ CSV เข้าฐานข้อมูล

ใช้ตอนตั้งโปรเจคบนเครื่องใหม่ หรือตอนสร้างฐานข้อมูลใหม่หลังไฟล์เสียหาย
คู่กับ scripts/export_weather.py ที่ส่งออกไฟล์นี้ไว้

รันซ้ำได้ปลอดภัย แถวที่มีอยู่แล้วจะถูกข้าม ไม่บันทึกซ้ำ

วิธีใช้:  python -m scripts.import_weather
"""

import csv
from datetime import date

from sqlmodel import Session, select

from app.config import DATA_DIR
from app.db import create_db_and_tables, engine
from app.models import WeatherDaily

SOURCE = DATA_DIR / "weather_daily.csv"


def number(text: str) -> float | None:
    """ช่องว่างหมายถึงไม่มีค่า ไม่ใช่ศูนย์"""
    text = (text or "").strip()
    return float(text) if text else None


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"ไม่พบไฟล์ {SOURCE}")

    create_db_and_tables()
    with Session(engine) as session:
        # โหลดคู่ (จังหวัด, วันที่) ที่มีอยู่แล้วมาไว้ในหน่วยความจำครั้งเดียว
        # เร็วกว่าการค้นฐานข้อมูลทีละแถวมาก เมื่อไฟล์มีเกือบสองแสนแถว
        seen = set(
            session.exec(select(WeatherDaily.province, WeatherDaily.observed_on)).all()
        )

        new = skipped = 0
        with SOURCE.open(encoding="utf-8", newline="") as handle:
            for index, row in enumerate(csv.DictReader(handle), start=1):
                key = (row["province"], date.fromisoformat(row["observed_on"]))
                if key in seen:
                    skipped += 1
                    continue

                session.add(WeatherDaily(
                    province=key[0],
                    observed_on=key[1],
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    temp_avg=number(row["temp_avg"]),
                    temp_max=number(row["temp_max"]),
                    temp_min=number(row["temp_min"]),
                    rainfall_mm=number(row["rainfall_mm"]),
                    humidity=number(row["humidity"]),
                    wind_speed=number(row["wind_speed"]),
                    pressure=number(row["pressure"]),
                ))
                seen.add(key)
                new += 1

                # บันทึกเป็นช่วงๆ เพื่อไม่ให้ค้างในหน่วยความจำทั้งหมด
                if new % 20000 == 0:
                    session.commit()

        session.commit()

    print(f"บันทึกใหม่ {new:,}  มีอยู่แล้ว(ข้าม) {skipped:,}")


if __name__ == "__main__":
    main()
