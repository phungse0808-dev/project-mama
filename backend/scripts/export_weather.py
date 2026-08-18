"""ส่งออกข้อมูลอากาศจากฐานข้อมูลเป็นไฟล์ CSV เพื่อเก็บไว้ใน git

ทำไมต้องมี
    ข้อมูลอากาศย้อนหลังถึงปี 2563 มีอยู่แค่ในไฟล์ฐานข้อมูลของเครื่องเดียว
    ซึ่งไม่ได้ขึ้น git เพราะเป็นไฟล์ไบนารีขนาด 47 MB
    ถ้าไฟล์นั้นเสียหรือย้ายไปเครื่องใหม่ ต้องดึงจาก NASA POWER ใหม่ทั้งหมด
    74 จังหวัด ย้อนหลัง 6 ปีครึ่ง ซึ่งเสียเวลาและอาจได้ค่าไม่ตรงเดิม
    ถ้าต้นทางปรับปรุงข้อมูลย้อนหลัง

    ไฟล์ CSV เป็นข้อความ git จึงบีบอัดได้ดี และข้อมูลย้อนหลังไม่เปลี่ยนอีก
    จึง commit ครั้งเดียวแล้วจบ ไม่โตขึ้นทุกครั้งที่เก็บข้อมูลใหม่

วิธีใช้:  python -m scripts.export_weather
"""

import csv

from sqlmodel import Session, select

from app.config import DATA_DIR
from app.db import engine
from app.models import WeatherDaily

TARGET = DATA_DIR / "weather_daily.csv"

COLUMNS = [
    "province", "observed_on", "latitude", "longitude",
    "temp_avg", "temp_max", "temp_min",
    "rainfall_mm", "humidity", "wind_speed", "pressure",
]


def main() -> None:
    with Session(engine) as session:
        rows = session.exec(
            select(WeatherDaily).order_by(WeatherDaily.province, WeatherDaily.observed_on)
        ).all()

    if not rows:
        raise SystemExit("ไม่มีข้อมูลอากาศในฐานข้อมูล")

    with TARGET.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)
        for row in rows:
            writer.writerow([
                row.province, row.observed_on.isoformat(),
                row.latitude, row.longitude,
                row.temp_avg, row.temp_max, row.temp_min,
                row.rainfall_mm, row.humidity, row.wind_speed, row.pressure,
            ])

    size_mb = TARGET.stat().st_size / 1024 / 1024
    provinces = len({row.province for row in rows})
    print(f"เขียน {TARGET.name}  {len(rows):,} แถว  {provinces} จังหวัด  {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
