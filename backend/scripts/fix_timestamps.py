"""แก้เวลาที่บันทึกไว้เป็น UTC ให้เป็นเวลาประเทศไทย

ใช้ครั้งเดียวหลังเปลี่ยนระบบเวลาใน models._now() จาก UTC เป็นเวลาท้องถิ่น
ข้อมูลที่บันทึกก่อนหน้านั้นเป็น UTC จึงต้องบวก 7 ชั่วโมงให้ตรงกับข้อมูลใหม่

สคริปต์นี้จะข้ามแถวที่แก้ไปแล้ว โดยดูจากว่าเวลานั้นอยู่ในอนาคตหรือไม่

วิธีใช้:  python -m scripts.fix_timestamps
"""

from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.db import engine
from app.models import CollectionLog, Reading, Station

OFFSET = timedelta(hours=7)


def main() -> None:
    now = datetime.now()
    with Session(engine) as session:
        fixed = 0

        for log in session.exec(select(CollectionLog)).all():
            # แถวที่ยังเป็น UTC จะดูเหมือนเกิดขึ้นนานเกินจริง เมื่อบวก 7 แล้ว
            # ต้องไม่เกินเวลาปัจจุบัน จึงจะถือว่าเป็นแถวเก่าที่ต้องแก้
            if log.started_at + OFFSET <= now:
                log.started_at += OFFSET
                if log.finished_at and log.finished_at + OFFSET <= now:
                    log.finished_at += OFFSET
                session.add(log)
                fixed += 1

        for reading in session.exec(select(Reading)).all():
            if reading.collected_at + OFFSET <= now:
                reading.collected_at += OFFSET
                session.add(reading)

        for station in session.exec(select(Station)).all():
            if station.first_seen + OFFSET <= now:
                station.first_seen += OFFSET
            if station.last_seen + OFFSET <= now:
                station.last_seen += OFFSET
            session.add(station)

        session.commit()
        print(f"แก้เวลาในตาราง collectionlog {fixed} แถว และปรับ reading/station เรียบร้อย")


if __name__ == "__main__":
    main()
