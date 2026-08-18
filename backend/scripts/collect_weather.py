"""ดึงข้อมูลอากาศรายวันจาก NASA POWER

ครั้งแรกให้ดึงย้อนหลังยาวๆ เพื่อสร้างฐานข้อมูลอ้างอิง
    python -m scripts.collect_weather --start 2020-01-01

หลังจากนั้นให้ตัวจัดตารางงานเรียกวันละครั้ง ระบบจะดึงต่อจากวันล่าสุดที่มีอยู่
    python -m scripts.collect_weather
"""

import argparse
from datetime import date, timedelta

from sqlmodel import Session

from app.db import create_db_and_tables, engine
from app.weather import collect, latest_observed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ดึงข้อมูลอากาศจาก NASA POWER")
    parser.add_argument("--start", help="วันเริ่มต้น รูปแบบ YYYY-MM-DD")
    parser.add_argument("--end", help="วันสิ้นสุด รูปแบบ YYYY-MM-DD")
    parser.add_argument("--pause", type=float, default=1.0, help="หน่วงเวลาระหว่างคำขอ (วินาที)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    create_db_and_tables()

    # NASA POWER มักอัปเดตข้อมูลช้ากว่าวันจริงราว 2-3 วัน จึงเผื่อไว้
    end = date.fromisoformat(args.end) if args.end else date.today() - timedelta(days=3)

    with Session(engine) as session:
        if args.start:
            start = date.fromisoformat(args.start)
        else:
            last = latest_observed(session)
            start = (last + timedelta(days=1)) if last else date(2020, 1, 1)

        if start > end:
            print(f"ข้อมูลเป็นปัจจุบันแล้ว (ล่าสุด {start - timedelta(days=1)})")
            return

        print(f"ดึงข้อมูลอากาศ {start} ถึง {end}")
        log = collect(session, start, end, pause=args.pause)

    print(f"\nบันทึกใหม่ {log.records_new:,} แถว  ซ้ำ(ข้าม) {log.records_duplicate:,} แถว")
    if log.error_message:
        print(f"หมายเหตุ: {log.error_message}")


if __name__ == "__main__":
    main()
