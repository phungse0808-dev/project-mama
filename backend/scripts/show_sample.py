"""แสดงตัวอย่างข้อมูลจริงที่เก็บได้ ใช้ตรวจสอบด้วยตาว่าข้อมูลสมเหตุสมผล

วิธีใช้:  python -m scripts.show_sample
"""

from sqlmodel import Session, col, desc, select

from app.db import engine
from app.models import Reading, Station, WeatherDaily


def main() -> None:
    with Session(engine) as session:
        print("=" * 72)
        print("ค่าฝุ่น PM2.5 สูงสุด 10 อันดับ ณ ชั่วโมงล่าสุดที่เก็บได้")
        print("=" * 72)
        rows = session.exec(
            select(Station, Reading)
            .join(Reading, col(Reading.station_id) == col(Station.id))
            .where(col(Reading.pm25).is_not(None))
            .order_by(desc(col(Reading.pm25)))
            .limit(10)
        ).all()
        print(f"{'สถานี':<34s}{'จังหวัด':<14s}{'PM2.5':>8s}{'AQI':>6s}  เวลา")
        for station, reading in rows:
            name = station.name_th[:32]
            print(
                f"{name:<34s}{station.province:<14s}"
                f"{reading.pm25:>8.1f}{reading.aqi or 0:>6d}  {reading.measured_at:%d/%m %H:%M}"
            )

        print()
        print("=" * 72)
        print("ข้อมูลอากาศจาก NASA POWER — จังหวัดเชียงใหม่")
        print("=" * 72)
        weather = session.exec(
            select(WeatherDaily)
            .where(WeatherDaily.province == "เชียงใหม่")
            .order_by(desc(col(WeatherDaily.observed_on)))
            .limit(10)
        ).all()
        print(f"{'วันที่':<13s}{'อุณหภูมิ':>9s}{'สูงสุด':>8s}{'ต่ำสุด':>8s}{'ฝน มม.':>9s}{'ความชื้น':>10s}{'ลม m/s':>9s}")
        for w in weather:
            print(
                f"{w.observed_on:%Y-%m-%d}  {w.temp_avg:>8.1f}{w.temp_max:>8.1f}"
                f"{w.temp_min:>8.1f}{w.rainfall_mm:>9.2f}{w.humidity:>10.1f}{w.wind_speed:>9.2f}"
            )
        print("=" * 72)


if __name__ == "__main__":
    main()
