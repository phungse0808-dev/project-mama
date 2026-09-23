"""นำค่าพยากรณ์ที่ GitHub Actions ออกไว้ เข้าสู่ฐานข้อมูลในเครื่อง

คู่กับ scripts/issue_forecast.py ที่รันบน GitHub Actions
    GitHub Actions  ออกค่า → เขียน issues.csv → commit เข้า repo
    เครื่องนี้       git pull → สคริปต์นี้ → ฐานข้อมูล → หน้าเว็บอ่านไปแสดง

รันซ้ำได้ปลอดภัย แถวที่มีอยู่แล้วจะอัปเดตเฉพาะค่าจริงที่เพิ่งเติม
ส่วนค่าที่ทายไว้จะไม่ถูกแก้ เพราะเป็นค่าที่ผู้ใช้เห็นไปแล้ว

วิธีใช้:  python -m scripts.import_forecast_issues
"""

import csv
from datetime import date, datetime
from pathlib import Path

from sqlmodel import Session, select

from app.config import DATA_DIR
from app.db import create_db_and_tables, engine
from app.models import ForecastIssue

SRC = Path(DATA_DIR) / "forecast" / "issues.csv"


def load(session: Session) -> tuple[int, int]:
    """คืนจำนวนแถวที่เพิ่มใหม่ และจำนวนแถวที่เติมค่าจริงให้"""
    if not SRC.exists():
        return 0, 0

    existing = {
        (row.province, row.issued_on, row.target): row
        for row in session.exec(select(ForecastIssue)).all()
    }

    added = updated = 0
    with SRC.open(encoding="utf-8") as f:
        for line in csv.DictReader(f):
            key = (line["province"], date.fromisoformat(line["issued_on"]), line["target"])
            actual = float(line["actual_pm25"]) if line["actual_pm25"] else None
            checked = datetime.fromisoformat(line["checked_at"]) if line["checked_at"] else None

            found = existing.get(key)
            if found is not None:
                # เติมเฉพาะค่าจริงที่ยังว่างอยู่ ไม่แตะค่าที่ทายไว้
                if found.actual_pm25 is None and actual is not None:
                    found.actual_pm25 = actual
                    found.checked_at = checked
                    session.add(found)
                    updated += 1
                continue

            session.add(
                ForecastIssue(
                    province=line["province"],
                    issued_on=key[1],
                    issued_at=datetime.fromisoformat(line["issued_at"]),
                    target=line["target"],
                    window_start=datetime.fromisoformat(line["window_start"]),
                    window_end=datetime.fromisoformat(line["window_end"]),
                    pm25=float(line["pm25"]),
                    previous_pm25=float(line["previous_pm25"]),
                    latest_pm25=float(line["latest_pm25"]),
                    actual_pm25=actual,
                    checked_at=checked,
                )
            )
            added += 1

    if added or updated:
        session.commit()
    return added, updated


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"ยังไม่มีไฟล์ {SRC} — สั่ง git pull ก่อน")
    create_db_and_tables()
    with Session(engine) as session:
        added, updated = load(session)
    print(f"เพิ่มค่าพยากรณ์ใหม่ {added} แถว · เติมค่าจริง {updated} แถว")


if __name__ == "__main__":
    main()
