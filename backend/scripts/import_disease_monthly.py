"""นำเข้าข้อมูลผู้ป่วยรายเดือน 77 จังหวัด และค่าฝุ่นรายเดือนย้อนหลัง

ไฟล์ต้นทางอยู่ที่ backend/data/raw/disease/
    disease_monthly.csv       จังหวัด เดือน โรค จำนวนคน จำนวนครั้ง opd ipd
    disease_age_summary.csv   จังหวัด โรค ช่วงอายุ เพศ จำนวนคน
    pm_monthly.csv            จังหวัด เดือน ค่าฝุ่นเฉลี่ย จำนวนชั่วโมงที่มีค่า

สามไฟล์นี้สร้างจากไฟล์ที่กรมควบคุมโรคส่งมาและจากคลังข้อมูล Open-Meteo
ขั้นตอนการสร้างเขียนไว้ใน docs/chapter4-dust-vs-cases.md

เรียกใช้
    python -m scripts.import_disease_monthly
"""

import csv
from datetime import datetime
from pathlib import Path

from sqlmodel import Session, delete, select

from app.db import create_db_and_tables, engine
from app.models import DiseaseAgeSummary, DiseaseMonthly, Pm25Monthly

# เก็บไว้นอก data/raw เพราะ raw ถูก gitignore ไว้สำหรับไฟล์ดิบจากต้นทาง
# สามไฟล์นี้เป็นข้อมูลที่สรุปแล้วและต้องติดไปกับโปรเจค เพื่อให้สร้างฐานข้อมูลใหม่ได้
RAW = Path(__file__).resolve().parent.parent / "data" / "disease"

DISEASE_SOURCE = (
    "กองดิจิทัลเพื่อการควบคุมโรค กรมควบคุมโรค จากคลัง HDC 43 แฟ้ม "
    "ตามหนังสือ สธ 0434.3/266 ลงวันที่ 11 กันยายน 2569"
)
PM25_SOURCE = "แบบจำลอง CAMS ผ่านคลังข้อมูล Open-Meteo ไม่ใช่ค่าที่สถานีตรวจวัดได้"

# ชื่อจังหวัดในไฟล์ผู้ป่วยกับในฐานข้อมูลสถานีเขียนไม่เหมือนกัน ใช้ชื่อเดียวกับสถานี
ALIAS = {"กรุงเทพมหานคร": "กรุงเทพฯ"}


def read(name: str) -> list[dict]:
    path = RAW / name
    if not path.exists():
        raise SystemExit(f"ไม่พบไฟล์ {path}")
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    create_db_and_tables()
    now = datetime.now()

    with Session(engine) as session:
        # ล้างของเดิมก่อนทุกครั้ง เพื่อให้รันซ้ำได้ผลเท่าเดิมเสมอ
        for model in (DiseaseMonthly, DiseaseAgeSummary, Pm25Monthly):
            session.exec(delete(model))
        session.commit()

        rows = read("disease_monthly.csv")
        session.add_all(
            DiseaseMonthly(
                province=ALIAS.get(r["province"], r["province"]),
                ym=r["ym"],
                disease=r["disease"],
                persons=int(r["persons"]),
                visits=int(r["visits"]),
                opd=int(r["opd"]),
                ipd=int(r["ipd"]),
                source=DISEASE_SOURCE,
                imported_at=now,
            )
            for r in rows
        )
        session.commit()
        print(f"ผู้ป่วยรายเดือน {len(rows):,} แถว")

        rows = read("disease_age_summary.csv")
        session.add_all(
            DiseaseAgeSummary(
                province=ALIAS.get(r["province"], r["province"]),
                disease=r["disease"],
                age_group=r["age_group"],
                sex=r["sex"],
                persons=int(r["persons"]),
                source=DISEASE_SOURCE,
                imported_at=now,
            )
            for r in rows
        )
        session.commit()
        print(f"แยกช่วงอายุ {len(rows):,} แถว")

        rows = read("pm_monthly.csv")
        session.add_all(
            Pm25Monthly(
                province=r["province"],
                ym=r["ym"],
                pm25=float(r["pm25"]),
                hours=int(r["hours"]),
                source=PM25_SOURCE,
                imported_at=now,
            )
            for r in rows
        )
        session.commit()
        print(f"ค่าฝุ่นรายเดือน {len(rows):,} แถว")

        provinces = set(session.exec(select(DiseaseMonthly.province).distinct()))
        with_pm = set(session.exec(select(Pm25Monthly.province).distinct()))
        print(f"จังหวัดในข้อมูลผู้ป่วย {len(provinces)} · มีค่าฝุ่นด้วย {len(provinces & with_pm)}")
        missing = sorted(provinces - with_pm)
        if missing:
            print("จังหวัดที่ยังไม่มีค่าฝุ่น:", ", ".join(missing))


if __name__ == "__main__":
    main()
