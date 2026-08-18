"""ดึงข้อมูลคุณภาพอากาศหนึ่งรอบ — สคริปต์นี้คือตัวที่ตัวจัดตารางงานเรียกทุกชั่วโมง

วิธีใช้:  python -m scripts.collect_air
"""

from sqlmodel import Session

from app.air4thai import collect
from app.db import create_db_and_tables, engine


def main() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        log = collect(session)

    if log.success:
        print(
            f"[{log.finished_at:%Y-%m-%d %H:%M:%S}] สำเร็จ  "
            f"สถานี {log.stations_seen}  "
            f"บันทึกใหม่ {log.records_new}  ซ้ำ(ข้าม) {log.records_duplicate}"
        )
    else:
        print(f"[{log.finished_at:%Y-%m-%d %H:%M:%S}] ล้มเหลว  {log.error_message}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
