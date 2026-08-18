"""แก้ชื่อจังหวัดของสถานีที่บันทึกไว้แล้วให้ถูกต้อง

ใช้เมื่อมีการปรับปรุงตรรกะการแยกชื่อจังหวัดใน parse_province
เพื่อให้ข้อมูลเก่าที่เก็บไว้แล้วถูกต้องตามไปด้วย โดยไม่ต้องเก็บข้อมูลใหม่

วิธีใช้:  python -m scripts.fix_provinces
"""

from sqlmodel import Session, func, select

from app.air4thai import parse_province
from app.db import engine
from app.models import Station


def main() -> None:
    with Session(engine) as session:
        stations = session.exec(select(Station)).all()
        changed = 0
        for station in stations:
            correct = parse_province(station.area_th)
            if station.province != correct:
                print(f"  {station.station_code:<8s} {station.province!r} -> {correct!r}")
                station.province = correct
                session.add(station)
                changed += 1
        session.commit()

        total = session.exec(select(func.count(func.distinct(Station.province)))).one()
        print(f"\nแก้ไข {changed} สถานี  ตอนนี้มี {total} จังหวัด (ประเทศไทยมี 77 จังหวัด)")


if __name__ == "__main__":
    main()
