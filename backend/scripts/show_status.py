"""แสดงสถานะข้อมูลที่เก็บสะสมไว้ ใช้ตรวจสอบว่าระบบเก็บข้อมูลทำงานปกติ

วิธีใช้:  python -m scripts.show_status
"""

from sqlmodel import Session, col, func, select

from app.db import engine
from app.models import CollectionLog, Reading, Station, WeatherDaily


def main() -> None:
    with Session(engine) as session:
        stations = session.exec(select(func.count()).select_from(Station)).one()
        readings = session.exec(select(func.count()).select_from(Reading)).one()
        weather = session.exec(select(func.count()).select_from(WeatherDaily)).one()
        provinces = session.exec(select(func.count(func.distinct(Station.province)))).one()

        print("=" * 58)
        print(f"สถานีตรวจวัด      {stations:>8,} สถานี  ใน {provinces} จังหวัด")
        print(f"ค่าตรวจวัดรายชั่วโมง {readings:>8,} แถว")
        print(f"ข้อมูลอากาศรายวัน   {weather:>8,} แถว")

        span = session.exec(
            select(func.min(Reading.measured_at), func.max(Reading.measured_at))
        ).one()
        if span[0]:
            print(f"ช่วงเวลาข้อมูล      {span[0]:%Y-%m-%d %H:%M}  ถึง  {span[1]:%Y-%m-%d %H:%M}")

        print("-" * 58)
        print("ความครบถ้วนของแต่ละสารมลพิษ")
        for field, label in (
            (Reading.pm25, "PM2.5"),
            (Reading.pm10, "PM10"),
            (Reading.o3, "O3"),
            (Reading.co, "CO"),
            (Reading.no2, "NO2"),
            (Reading.so2, "SO2"),
        ):
            have = session.exec(
                select(func.count()).select_from(Reading).where(col(field).is_not(None))
            ).one()
            pct = 100 * have / readings if readings else 0
            print(f"  {label:<6s} {have:>7,} / {readings:,}  ({pct:5.1f}%)")

        print("-" * 58)
        print("การดึงข้อมูล 5 ครั้งล่าสุด")
        logs = session.exec(
            select(CollectionLog).order_by(col(CollectionLog.started_at).desc()).limit(5)
        ).all()
        for log in logs:
            status = "สำเร็จ " if log.success else "ล้มเหลว"
            detail = (
                f"ใหม่ {log.records_new:>3}  ซ้ำ {log.records_duplicate:>3}"
                if log.success
                else (log.error_message or "")[:40]
            )
            print(f"  {log.started_at:%Y-%m-%d %H:%M:%S}  {log.source:<11s} {status}  {detail}")
        print("=" * 58)


if __name__ == "__main__":
    main()
