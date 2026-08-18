"""ตรวจว่าเครือข่ายสถานีตรวจวัดครอบคลุมกี่จังหวัด และจังหวัดใดไม่มีสถานี

เทียบรายชื่อจังหวัดในระบบกับรายชื่อทางการจากไฟล์สถิติทะเบียนราษฎร
ของกรมการปกครอง ซึ่งมีครบทั้ง 77 จังหวัด

ผลลัพธ์ใช้เขียนข้อจำกัดของงานวิจัยได้ว่าระบบครอบคลุมพื้นที่แค่ไหน

วิธีใช้:  python -m scripts.check_province_coverage
"""

from sqlmodel import Session, col, func, select

from app.db import engine
from app.models import Reading, Station
from app.services import is_stale, latest_readings
from scripts.population import parse_population

POPULATION_FILE = "data/population_2567.txt"


def official_provinces() -> set[str]:
    with open(POPULATION_FILE, encoding="utf-8-sig") as handle:
        return set(parse_population(handle.read()))


def main() -> None:
    official = official_provinces()

    with Session(engine) as session:
        with_station = set(
            session.exec(select(Station.province).group_by(Station.province)).all()
        )

        # จังหวัดที่มีค่าฝุ่นใช้งานได้จริง ณ ขณะนี้ คือไม่ค้างเก่าและมีค่า PM2.5
        reporting: set[str] = set()
        stale_only: set[str] = set()
        for station, reading in latest_readings(session):
            if not is_stale(reading) and reading.pm25 is not None:
                reporting.add(station.province)
            else:
                stale_only.add(station.province)

        counts = dict(
            session.exec(
                select(Station.province, func.count()).group_by(Station.province)
            ).all()
        )
        readings_total = session.exec(select(func.count()).select_from(Reading)).one()

    no_station = sorted(official - with_station)
    not_reporting = sorted(with_station - reporting)

    print(f"จังหวัดทั้งหมดของประเทศไทย        {len(official)}")
    print(f"จังหวัดที่มีสถานีตรวจวัด           {len(with_station)}")
    print(f"จังหวัดที่มีข้อมูลใช้งานได้ขณะนี้    {len(reporting)}")
    print(f"สถานีทั้งหมด {sum(counts.values())} แห่ง  ค่าตรวจวัดสะสม {readings_total:,} แถว")

    print(f"\nจังหวัดที่ไม่มีสถานีตรวจวัดเลย ({len(no_station)})")
    for name in no_station:
        print(f"  {name}")

    print(f"\nจังหวัดที่มีสถานีแต่ตอนนี้ไม่มีข้อมูลใช้งานได้ ({len(not_reporting)})")
    for name in not_reporting:
        print(f"  {name}  ({counts.get(name, 0)} สถานี)")

    print("\nจังหวัดที่มีสถานีมากที่สุด 5 อันดับ")
    for name, number in sorted(counts.items(), key=lambda item: item[1], reverse=True)[:5]:
        print(f"  {name:<14s} {number} สถานี")


if __name__ == "__main__":
    main()
