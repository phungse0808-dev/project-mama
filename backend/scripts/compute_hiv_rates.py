"""คำนวณอัตราผู้ติดเชื้อเอชไอวีต่อประชากรแสนคน

ทำไมต้องคำนวณ
    รายงานเผยแพร่เฉพาะ "จำนวนคน" ซึ่งเทียบข้ามจังหวัดไม่ได้ เพราะจังหวัดที่มีประชากรมาก
    ย่อมมีผู้ติดเชื้อมากตามไปด้วย ถ้าจัดอันดับด้วยจำนวนดิบ กรุงเทพฯ จะขึ้นอันดับหนึ่งเสมอ
    เพราะมีคนเยอะ ไม่ใช่เพราะสัดส่วนผู้ติดเชื้อสูง

    การหารด้วยจำนวนประชากรแล้วคูณแสน ทำให้เทียบกันได้อย่างเป็นธรรม
    เป็นวิธีมาตรฐานทางระบาดวิทยา

แหล่งข้อมูลประชากร
    สถิติจำนวนประชากรจากทะเบียนบ้าน สำนักทะเบียนกลาง กรมการปกครอง
    https://stat.bora.dopa.go.th/new_stat/file/67/stat_c67.txt

วิธีใช้
    python -m scripts.compute_hiv_rates
"""

from pathlib import Path

import requests
from sqlmodel import Session, col, select

from app.config import REQUEST_TIMEOUT
from app.db import engine
from app.models import HivStatistic

POPULATION_URL = "https://stat.bora.dopa.go.th/new_stat/file/67/stat_c67.txt"
POPULATION_FILE = Path("data/population_2567.txt")
POPULATION_SOURCE = "สถิติทะเบียนราษฎร ธันวาคม 2567 สำนักทะเบียนกลาง กรมการปกครอง"


def download_population() -> str:
    """ดาวน์โหลดไฟล์สถิติประชากร เก็บไว้ในเครื่องเพื่อให้ตรวจสอบย้อนกลับได้"""
    if POPULATION_FILE.exists():
        return POPULATION_FILE.read_text(encoding="utf-8-sig")

    response = requests.get(POPULATION_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    text = response.content.decode("utf-8-sig")
    POPULATION_FILE.parent.mkdir(parents=True, exist_ok=True)
    POPULATION_FILE.write_text(text, encoding="utf-8")
    return text


def normalise_province(name: str) -> str:
    """แปลงชื่อจังหวัดจากไฟล์ทะเบียนราษฎรให้ตรงกับชื่อที่ใช้ในระบบ

    ไฟล์ต้นทางเขียนว่า "จังหวัดเชียงใหม่" และ "กรุงเทพมหานคร"
    แต่ระบบเก็บเป็น "เชียงใหม่" และ "กรุงเทพฯ" ตามที่ได้จาก Air4Thai
    """
    cleaned = name.strip()
    if cleaned.startswith("จังหวัด"):
        cleaned = cleaned[len("จังหวัด"):].strip()
    if cleaned in ("กรุงเทพมหานคร", "กรุงเทพ"):
        return "กรุงเทพฯ"
    return cleaned


def parse_population(text: str) -> dict[str, int]:
    """อ่านจำนวนประชากรรวมของแต่ละจังหวัด

    รูปแบบไฟล์คั่นด้วยเครื่องหมาย | โดยช่องที่ 11 คือประชากรรวมชายหญิง
    """
    population: dict[str, int] = {}
    for line in text.splitlines():
        parts = line.split("|")
        if len(parts) < 12:
            continue
        name = parts[2].strip()
        if not name or name == "ทั่วประเทศ":
            continue
        try:
            total = int(parts[11].replace(",", ""))
        except ValueError:
            continue
        population[normalise_province(name)] = total
    return population


def main() -> None:
    population = parse_population(download_population())
    print(f"อ่านจำนวนประชากรได้ {len(population)} จังหวัด")

    with Session(engine) as session:
        rows = session.exec(
            select(HivStatistic).where(col(HivStatistic.rate_per_100k).is_(None))
        ).all()

        updated = 0
        missing: list[str] = []

        for row in rows:
            people = population.get(row.province)
            if people is None or not row.cases:
                missing.append(row.province)
                continue

            row.rate_per_100k = round(row.cases / people * 100_000, 1)
            note = row.note or ""
            row.note = f"{note} | ประชากร {people:,} คน ({POPULATION_SOURCE})".strip(" |")
            session.add(row)
            updated += 1
            print(f"  {row.province:<14s} {row.cases:>7,} คน / {people:>10,} = {row.rate_per_100k:>6.1f} ต่อแสน")

        session.commit()

    print(f"\nคำนวณอัตราสำเร็จ {updated} จังหวัด")
    if missing:
        print(f"ไม่พบข้อมูลประชากรของ {len(missing)} จังหวัด: {', '.join(missing[:10])}")


if __name__ == "__main__":
    main()
