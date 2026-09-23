"""ออกค่าพยากรณ์ประจำวันและบันทึกเป็นไฟล์ CSV สำหรับ GitHub Actions

ทำไมต้องเป็น CSV
    ฐานข้อมูลไม่ขึ้น git เพราะสร้างใหม่จาก CSV ได้เสมอ ค่าพยากรณ์ที่ออกไปแล้ว
    จึงต้องเก็บเป็นไฟล์ในรีโปเหมือนค่าฝุ่นรายชั่วโมง ไม่งั้นพอสร้างฐานข้อมูลใหม่
    ประวัติการพยากรณ์จะหายไปทั้งหมด และวัดความแม่นจากการใช้งานจริงไม่ได้อีก

ลำดับการทำงานบน GitHub Actions
    ดึงค่าฝุ่นชั่วโมงล่าสุด → สร้างฐานข้อมูลจาก CSV ทั้งหมด → สคริปต์นี้
    ออกค่าของวันนี้ถ้าถึงเวลาแล้ว → เติมค่าจริงให้รอบเก่า → เขียนทับ issues.csv

วิธีใช้:  python -m scripts.issue_forecast
"""

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session, col, select

from app.config import DATA_DIR
from app.db import create_db_and_tables, engine
from app.forecast_issue import ISSUE_HOUR, fill_actuals, issue_today
from app.models import ForecastIssue

OUT = Path(DATA_DIR) / "forecast" / "issues.csv"

# เวลาไทย เขียนตรง ๆ ไม่พึ่งนาฬิกาของเครื่องที่รัน
#
# GitHub Actions ใช้เวลา UTC ถ้าใช้ datetime.now() ตรง ๆ ค่าจะออกช้ากว่าที่ตั้งใจ 7 ชั่วโมง
# และเวลาในฐานข้อมูลทั้งระบบเป็นเวลาไทย ตามที่ Air4Thai ส่งมา
THAI_TIME = timezone(timedelta(hours=7))


def thai_now() -> datetime:
    """เวลาปัจจุบันของไทย แบบไม่มีข้อมูลเขตเวลาติดมา ให้เทียบกับค่าในฐานข้อมูลได้ตรง ๆ"""
    return datetime.now(THAI_TIME).replace(tzinfo=None)


COLUMNS = [
    "province",
    "issued_on",
    "issued_at",
    "target",
    "window_start",
    "window_end",
    "pm25",
    "previous_pm25",
    "latest_pm25",
    "actual_pm25",
    "checked_at",
]


def export(session: Session) -> int:
    """เขียนค่าพยากรณ์ทั้งหมดในฐานข้อมูลลงไฟล์เดียว เรียงให้ผลลัพธ์นิ่ง

    เรียงทุกครั้งเพื่อให้ไฟล์เปลี่ยนเฉพาะเมื่อข้อมูลเปลี่ยนจริง
    ไม่ใช่เปลี่ยนเพราะลำดับแถวสลับกัน ซึ่งจะทำให้เกิด commit เปล่าทุกชั่วโมง
    """
    rows = session.exec(
        select(ForecastIssue).order_by(
            col(ForecastIssue.issued_on),
            col(ForecastIssue.province),
            col(ForecastIssue.target),
        )
    ).all()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(COLUMNS)
        for row in rows:
            writer.writerow(
                [
                    row.province,
                    row.issued_on.isoformat(),
                    row.issued_at.isoformat(timespec="seconds"),
                    row.target,
                    row.window_start.isoformat(timespec="minutes"),
                    row.window_end.isoformat(timespec="minutes"),
                    row.pm25,
                    row.previous_pm25,
                    row.latest_pm25,
                    "" if row.actual_pm25 is None else row.actual_pm25,
                    "" if row.checked_at is None else row.checked_at.isoformat(timespec="seconds"),
                ]
            )
    return len(rows)


def main() -> None:
    create_db_and_tables()
    now = thai_now()

    with Session(engine) as session:
        issued = issue_today(session, now.date()) if now.hour >= ISSUE_HOUR else 0
        filled = fill_actuals(session, now)
        total = export(session)

    print(f"เวลาไทยตอนนี้ {now:%Y-%m-%d %H:%M} · เวลาออกค่าประจำวัน {ISSUE_HOUR}:00")
    print(f"ออกค่าใหม่ {issued} แถว · เติมค่าจริง {filled} แถว")
    print(f"เขียนไฟล์ {OUT} รวม {total} แถว")


if __name__ == "__main__":
    main()
