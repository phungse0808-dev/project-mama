"""นำเข้าสถิติผู้ติดเชื้อเอชไอวีรายจังหวัดจากไฟล์ CSV

ทำไมต้องนำเข้าด้วยมือ
    ข้อมูลชุดนี้ไม่มี API สาธารณะให้ดึงอัตโนมัติเหมือน Air4Thai และ NASA POWER
    ต้องคัดลอกตัวเลขจากรายงานที่หน่วยงานรัฐเผยแพร่มากรอกลงไฟล์ CSV เอง
    จึงต้องระบุแหล่งที่มาทุกแถวเพื่อให้ตรวจสอบย้อนกลับได้

ข้อกำหนดที่ต้องยึด
    ใช้ได้เฉพาะตัวเลขรวมยอดระดับจังหวัดที่เผยแพร่เป็นสาธารณะแล้วเท่านั้น
    ห้ามนำเข้าข้อมูลรายบุคคล และห้ามนำเข้าข้อมูลที่ละเอียดกว่าระดับจังหวัด

รูปแบบไฟล์ CSV
    province,year,cases,rate_per_100k,source,note

วิธีใช้
    สร้างไฟล์ต้นแบบให้กรอก   python -m scripts.import_hiv --template
    นำเข้าข้อมูลที่กรอกแล้ว    python -m scripts.import_hiv data/hiv_by_province.csv
"""

import argparse
import csv
from pathlib import Path

from sqlmodel import Session, col, select

from app.db import create_db_and_tables, engine
from app.models import HivStatistic, Station

TEMPLATE_PATH = Path("data/hiv_by_province_template.csv")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="นำเข้าสถิติผู้ติดเชื้อเอชไอวีรายจังหวัด")
    parser.add_argument("csv_path", nargs="?", help="ไฟล์ CSV ที่กรอกข้อมูลแล้ว")
    parser.add_argument(
        "--template",
        action="store_true",
        help="สร้างไฟล์ต้นแบบที่มีรายชื่อจังหวัดครบให้กรอก",
    )
    return parser.parse_args()


def write_template() -> None:
    """สร้างไฟล์ CSV ที่มีรายชื่อจังหวัดครบตามที่มีสถานีตรวจวัด ให้กรอกตัวเลขเอง"""
    with Session(engine) as session:
        provinces = session.exec(
            select(Station.province).group_by(Station.province).order_by(col(Station.province))
        ).all()

    TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with TEMPLATE_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["province", "year", "cases", "rate_per_100k", "source", "note"])
        for province in provinces:
            writer.writerow([province, "", "", "", "", ""])

    print(f"สร้างไฟล์ต้นแบบแล้ว {TEMPLATE_PATH}  ({len(provinces)} จังหวัด)")
    print()
    print("ขั้นตอนต่อไป")
    print("  1. เปิดไฟล์ด้วย Excel แล้วกรอกตัวเลขจากรายงานที่เผยแพร่")
    print("     ช่อง year ใส่ปี พ.ศ. เช่น 2567")
    print("     ช่อง cases ใส่จำนวนผู้ติดเชื้อที่ยังมีชีวิตอยู่")
    print("     ช่อง rate_per_100k ใส่อัตราต่อประชากรแสนคน ใช้เทียบข้ามจังหวัด")
    print("     ช่อง source ใส่ชื่อรายงานและหน่วยงาน เช่น รายงานสถานการณ์เอชไอวี กรมควบคุมโรค")
    print("  2. บันทึกเป็น CSV UTF-8")
    print("  3. สั่ง python -m scripts.import_hiv data/hiv_by_province_template.csv")


def to_int(value: str) -> int | None:
    text = value.strip().replace(",", "")
    return int(text) if text else None


def to_float(value: str) -> float | None:
    text = value.strip().replace(",", "")
    return float(text) if text else None


def import_csv(path: Path) -> None:
    if not path.exists():
        print(f"ไม่พบไฟล์ {path}")
        return

    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    added = updated = skipped = 0
    problems: list[str] = []

    with Session(engine) as session:
        for line, row in enumerate(rows, start=2):
            province = (row.get("province") or "").strip()
            year_text = (row.get("year") or "").strip()
            source = (row.get("source") or "").strip()

            # ข้ามแถวที่ยังไม่ได้กรอก ถือเป็นเรื่องปกติของไฟล์ต้นแบบ
            if not province or not year_text:
                skipped += 1
                continue

            if not source:
                problems.append(f"บรรทัด {line}: {province} ไม่ได้ระบุแหล่งที่มา")
                continue

            try:
                year = int(year_text)
                cases = to_int(row.get("cases") or "")
                rate = to_float(row.get("rate_per_100k") or "")
            except ValueError:
                problems.append(f"บรรทัด {line}: {province} ตัวเลขไม่ถูกต้อง")
                continue

            if cases is None and rate is None:
                problems.append(f"บรรทัด {line}: {province} ไม่มีทั้งจำนวนและอัตรา")
                continue

            existing = session.exec(
                select(HivStatistic).where(
                    HivStatistic.province == province, HivStatistic.year == year
                )
            ).first()

            if existing:
                existing.cases = cases
                existing.rate_per_100k = rate
                existing.source = source
                existing.note = (row.get("note") or "").strip() or None
                session.add(existing)
                updated += 1
            else:
                session.add(
                    HivStatistic(
                        province=province,
                        year=year,
                        cases=cases,
                        rate_per_100k=rate,
                        source=source,
                        note=(row.get("note") or "").strip() or None,
                    )
                )
                added += 1

        session.commit()

    print(f"เพิ่มใหม่ {added} แถว  ปรับปรุง {updated} แถว  ข้าม(ยังไม่กรอก) {skipped} แถว")
    if problems:
        print(f"\nพบปัญหา {len(problems)} แถว")
        for problem in problems[:15]:
            print(f"  {problem}")


def main() -> None:
    args = parse_args()
    create_db_and_tables()

    if args.template:
        write_template()
        return

    if not args.csv_path:
        print("ต้องระบุไฟล์ CSV หรือใช้ --template เพื่อสร้างไฟล์ต้นแบบก่อน")
        return

    import_csv(Path(args.csv_path))


if __name__ == "__main__":
    main()
