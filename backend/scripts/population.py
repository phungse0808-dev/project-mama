"""อ่านจำนวนประชากรรายจังหวัดจากไฟล์สถิติทะเบียนราษฎร

แยกออกมาเป็นโมดูลของตัวเอง เพราะจำนวนประชากรเป็นข้อมูลพื้นฐานที่หลายสคริปต์
ใช้ร่วมกัน ไม่ได้ผูกกับการวิเคราะห์เรื่องใดเรื่องหนึ่ง

แหล่งข้อมูล
    สถิติจำนวนประชากรจากทะเบียนบ้าน สำนักทะเบียนกลาง กรมการปกครอง
    https://stat.bora.dopa.go.th/new_stat/file/67/stat_c67.txt
"""

from pathlib import Path

import requests

from app.config import REQUEST_TIMEOUT

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
