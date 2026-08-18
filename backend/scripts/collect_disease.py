"""ดึงข้อมูลการเฝ้าระวังผลกระทบทางสุขภาพจากฝุ่น PM2.5 ของกรมควบคุมโรค

แหล่งข้อมูล
    opendata.ddc.moph.go.th ชุด "การเฝ้าระวังผลกระทบทางสุขภาพที่เกี่ยวข้องจากฝุ่น PM2.5"
    เป็นแหล่งปฐมภูมิ ดึงผ่าน API ได้โดยตรง ไม่ต้องนำเข้าด้วยมือ

เรื่องความเป็นส่วนตัว อ่านก่อนแก้ไขสคริปต์นี้
    ต้นทางเผยแพร่เป็นข้อมูล "รายบุคคล" แต่ละแถวคือผู้ป่วยหนึ่งครั้งที่มารับบริการ
    มีวันเกิด เพศ อายุ อาชีพ ตำบล และชื่อโรงพยาบาลครบ

    สคริปต์นี้จะรวมยอดในหน่วยความจำทันทีที่อ่านแต่ละแถว แล้วทิ้งรายละเอียดบุคคลไป
    สิ่งที่บันทึกลงฐานข้อมูลมีเพียง จังหวัด วันที่ กลุ่มโรค และจำนวนราย

    ห้ามแก้ให้บันทึกช่องอื่นเพิ่ม โดยเฉพาะ ampurname tambonname hosname birth
    เพราะยิ่งละเอียดยิ่งย้อนกลับไประบุตัวผู้ป่วยได้ ถึงต้นทางจะเปิดเผยไว้แล้วก็ตาม
    การที่ข้อมูลเปิดให้เข้าถึงได้ ไม่ได้แปลว่าควรนำมาเก็บต่อในระบบอื่น

วิธีใช้:  python -m scripts.collect_disease
"""

import csv
import io
from collections import Counter
from datetime import date

import requests
from sqlmodel import Session, select

from app.config import CA_BUNDLE, REQUEST_TIMEOUT
from app.db import create_db_and_tables, engine
from app.models import DiseaseDaily

CKAN = "https://opendata.ddc.moph.go.th/api/3/action"
DATASET = "pm2-5"
SOURCE = "ระบบเฝ้าระวังผลกระทบทางสุขภาพจากฝุ่น PM2.5 กรมควบคุมโรค (opendata.ddc.moph.go.th)"

# ช่องที่อนุญาตให้อ่าน มีเพียงสามช่องนี้เท่านั้น
# ช่องอื่นในไฟล์ต้นทางเป็นข้อมูลส่วนบุคคล ไม่แตะ
PROVINCE_FIELD = "changwatname"
DATE_FIELD = "date_serv"
DISEASE_FIELD = "diagname"


def list_resources() -> list[dict]:
    """รายการไฟล์ข้อมูลรายเดือนในชุดนี้ ข้ามพจนานุกรมข้อมูล"""
    response = requests.get(
        f"{CKAN}/package_show", params={"id": DATASET},
        timeout=REQUEST_TIMEOUT, verify=CA_BUNDLE,
    )
    response.raise_for_status()
    return [
        item
        for item in response.json()["result"]["resources"]
        if "datadic" not in (item.get("name") or "").lower()
    ]


def rows_from_datastore(resource_id: str):
    """อ่านผ่าน API ทีละหน้า สำหรับไฟล์ที่ต้นทางเปิด datastore ไว้"""
    offset = 0
    while True:
        response = requests.get(
            f"{CKAN}/datastore_search",
            params={"resource_id": resource_id, "limit": 1000, "offset": offset},
            timeout=REQUEST_TIMEOUT, verify=CA_BUNDLE,
        )
        response.raise_for_status()
        result = response.json()["result"]
        yield from result["records"]
        offset += 1000
        if offset >= result["total"]:
            return


def rows_from_csv(url: str):
    """อ่านไฟล์ CSV ตรง สำหรับเดือนที่ต้นทางไม่ได้เปิด datastore"""
    response = requests.get(url, timeout=REQUEST_TIMEOUT, verify=CA_BUNDLE)
    response.raise_for_status()
    for encoding in ("utf-8-sig", "cp874"):
        try:
            text = response.content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        return
    yield from csv.DictReader(io.StringIO(text))


def parse_day(raw: str) -> date | None:
    """แปลงวันที่จากต้นทาง ซึ่งเขียนไม่เหมือนกันในแต่ละเดือน

    เดือนกุมภาพันธ์ มีนาคม มิถุนายน กรกฎาคม เขียนแบบสากล  2023-02-01
    เดือนมกราคม สิงหาคม เขียนแบบอเมริกัน                   8/19/2023

    ถ้ารองรับแบบเดียวจะข้ามทั้งเดือนโดยไม่มีข้อความเตือน ซึ่งอันตรายกว่าพังไปเลย
    เพราะดูผิวเผินเหมือนทำงานสำเร็จ แต่ข้อมูลหายไปเงียบๆ
    """
    raw = raw.strip()
    if not raw:
        return None

    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        pass

    parts = raw.split(" ")[0].split("/")
    if len(parts) != 3:
        return None
    try:
        first, second, year = (int(p) for p in parts)
    except ValueError:
        return None

    # ตัวเลขที่เกิน 12 เป็นวันที่แน่นอน ใช้แยกว่าเดือนอยู่หน้าหรือหลัง
    month, day = (second, first) if first > 12 else (first, second)
    try:
        return date(year, month, day)
    except ValueError:
        return None


def tally(rows) -> Counter:
    """นับจำนวนรายต่อ (จังหวัด, วันที่, กลุ่มโรค)

    จุดนี้คือจุดที่ข้อมูลรายบุคคลถูกทิ้ง ทุกแถวที่อ่านเข้ามาถูกย่อเหลือแค่กุญแจสามช่อง
    ตั้งแต่ก่อนออกจากฟังก์ชันนี้ ไม่มีการเก็บหรือส่งต่อช่องอื่นไปที่ใด
    """
    counter: Counter = Counter()
    for row in rows:
        province = (row.get(PROVINCE_FIELD) or "").strip()
        disease = (row.get(DISEASE_FIELD) or "").strip()
        raw_date = (row.get(DATE_FIELD) or "").strip()
        if not province or not disease or not raw_date:
            continue
        observed_on = parse_day(raw_date)
        if observed_on is None:
            continue
        counter[(province, observed_on, disease)] += 1
    return counter


def main() -> None:
    resources = list_resources()
    print(f"พบไฟล์ข้อมูล {len(resources)} รายการ")

    totals: Counter = Counter()
    for item in resources:
        name = (item.get("name") or "")[:60]
        if item.get("datastore_active"):
            rows = rows_from_datastore(item["id"])
            how = "API"
        else:
            rows = rows_from_csv(item["url"])
            how = "CSV"
        counted = tally(rows)
        totals.update(counted)
        print(f"  [{how}] {name}  ->  {sum(counted.values()):,} ราย")

    create_db_and_tables()
    with Session(engine) as session:
        existing = {
            (row.province, row.observed_on, row.disease_group): row
            for row in session.exec(select(DiseaseDaily)).all()
        }

        new = updated = 0
        for (province, observed_on, disease), cases in sorted(totals.items()):
            row = existing.get((province, observed_on, disease))
            if row is None:
                session.add(DiseaseDaily(
                    province=province, observed_on=observed_on,
                    disease_group=disease, cases=cases, source=SOURCE,
                ))
                new += 1
            elif row.cases != cases:
                row.cases = cases
                session.add(row)
                updated += 1
        session.commit()

    print()
    print(f"รวม {sum(totals.values()):,} ราย  ย่อเหลือ {len(totals):,} แถว")
    print(f"บันทึกใหม่ {new}  ปรับปรุง {updated}")


if __name__ == "__main__":
    main()
