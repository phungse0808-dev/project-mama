"""ดึงข้อมูลคุณภาพอากาศจาก Air4Thai กรมควบคุมมลพิษ

หมายเหตุสำคัญเรื่องเวลา: Air4Thai ส่งวันและเวลาเป็นเวลาประเทศไทย (UTC+7)
ระบบนี้จึงเก็บ measured_at เป็นเวลาไทยตามต้นทาง เพื่อไม่ให้เกิดความสับสน
เวลาตีความผลวิเคราะห์ เช่น ช่วงเช้าที่ฝุ่นสูงต้องตรงกับเวลาจริงในพื้นที่
"""

import json
from datetime import datetime
from pathlib import Path

import requests
from sqlmodel import Session, col, select

from app.config import AIR4THAI_URL, CA_BUNDLE, MISSING_VALUE, RAW_DIR, REQUEST_TIMEOUT
from app.models import CollectionLog, Reading, Station

POLLUTANTS = ("PM25", "PM10", "O3", "CO", "NO2", "SO2")

BANGKOK = "กรุงเทพฯ"

# ชื่อจังหวัดที่ต้นทางสะกดไม่ตรงกับชื่อทางการ
#
# ทั้งสองชื่อตาดูแทบไม่ต่างกัน แต่รหัสตัวอักษรต่างกัน คอมพิวเตอร์จึงถือว่าคนละคำ
# ทำให้การเชื่อมข้อมูลข้ามแหล่ง เช่น เทียบกับสถิติประชากรของกรมการปกครอง
# พลาดแบบเงียบๆ คือไม่ขึ้นข้อผิดพลาด แต่หาไม่เจอแล้วตกหล่นไปทั้งจังหวัด
#
#   กาฬสินธุ์        ต้นทางวางไม้ทัณฑฆาตก่อนสระอุ  ทางการวางสระอุก่อน
#   ประจวบคีรีขันธ์  ต้นทางใช้สระอิ                ทางการใช้สระอี
#
# แก้ที่จุดนี้จุดเดียว ข้อมูลที่เก็บใหม่ทั้งหมดจึงสะกดถูกตั้งแต่ต้น
PROVINCE_CORRECTIONS = {
    "กาฬสินธ์ุ": "กาฬสินธุ์",
    "ประจวบคิรีขันธ์": "ประจวบคีรีขันธ์",
}


def fetch_raw() -> dict:
    """ดึงข้อมูลสดจาก Air4Thai"""
    response = requests.get(AIR4THAI_URL, timeout=REQUEST_TIMEOUT, verify=CA_BUNDLE)
    response.raise_for_status()
    return response.json()


def save_raw(payload: dict) -> Path:
    """เก็บข้อมูลดิบไว้เป็นไฟล์ เผื่อต้องประมวลผลใหม่หรือตรวจสอบย้อนหลัง

    เป็นแนวปฏิบัติที่จำเป็นสำหรับงานวิจัย เพราะถ้าพบภายหลังว่าโค้ดแปลงข้อมูลผิด
    จะยังกู้ข้อมูลกลับมาได้จากไฟล์ดิบ โดยไม่ต้องรอเก็บใหม่ซึ่งย้อนเวลาไม่ได้
    """
    now = datetime.now()
    folder = RAW_DIR / now.strftime("%Y-%m-%d")
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"air4thai_{now.strftime('%H%M%S')}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def to_float(raw: object) -> float | None:
    """แปลงค่าที่ได้จาก API เป็นตัวเลข โดยถือว่า -1 และค่าว่างคือไม่มีข้อมูล"""
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return None if value <= MISSING_VALUE else value


def to_int(raw: object) -> int | None:
    value = to_float(raw)
    return int(value) if value is not None else None


def parse_province(area_th: str) -> str:
    """แยกชื่อจังหวัดออกจากข้อความที่อยู่

    ต้นทางเขียนที่อยู่ไม่เป็นรูปแบบเดียวกัน พบ 3 แบบ
        1. "ต.ปากน้ำ อ.เมือง, กระบี่"      จังหวัดอยู่หลังคอมมาตัวสุดท้าย
        2. "ต.บ่อยาง อ.เมือง, จ.สงขลา"     มีคำนำหน้า "จ." ต้องตัดออก
        3. "สวนลุมพินี เขตปทุมวัน"          สถานีของ กทม. ไม่มีคอมมาและไม่ระบุจังหวัด
                                            สังเกตจากคำว่า "เขต" หรือ "แขวง"
    """
    text = area_th.strip()
    province = text.rsplit(",", 1)[1].strip() if "," in text else text

    # สถานีในสังกัดกรุงเทพมหานครระบุเพียงชื่อสถานที่กับเขต ไม่ระบุจังหวัด
    if "เขต" in province or "แขวง" in province:
        return BANGKOK

    if province.startswith("จ."):
        province = province[2:].strip()

    if province in ("กรุงเทพมหานคร", "กรุงเทพ"):
        return BANGKOK

    return PROVINCE_CORRECTIONS.get(province, province)


def parse_measured_at(aqi_last: dict) -> datetime | None:
    """รวมวันที่กับเวลาจากต้นทางให้เป็น datetime เดียว"""
    date_text = (aqi_last.get("date") or "").strip()
    time_text = (aqi_last.get("time") or "").strip()
    if not date_text or not time_text:
        return None
    try:
        return datetime.strptime(f"{date_text} {time_text}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def upsert_station(session: Session, raw: dict) -> Station | None:
    """บันทึกสถานีใหม่ หรืออัปเดตข้อมูลสถานีเดิมที่เคยเจอแล้ว"""
    code = (raw.get("stationID") or "").strip()
    if not code:
        return None

    latitude = to_float(raw.get("lat"))
    longitude = to_float(raw.get("long"))
    if latitude is None or longitude is None:
        return None

    station = session.exec(select(Station).where(Station.station_code == code)).first()
    area_th = raw.get("areaTH") or ""

    if station is None:
        station = Station(
            station_code=code,
            name_th=(raw.get("nameTH") or "").strip(),
            name_en=(raw.get("nameEN") or "").strip(),
            area_th=area_th,
            area_en=raw.get("areaEN") or "",
            province=parse_province(area_th),
            station_type=raw.get("stationType") or "",
            latitude=latitude,
            longitude=longitude,
        )
        session.add(station)
        session.flush()  # ให้ได้ station.id ทันทีเพื่อใช้ผูกกับ reading
    else:
        station.last_seen = datetime.now()
        station.is_active = True
        session.add(station)

    return station


def collect(session: Session) -> CollectionLog:
    """ดึงข้อมูลหนึ่งรอบแล้วบันทึกลงฐานข้อมูล พร้อมบันทึก log"""
    log = CollectionLog(source="air4thai")
    session.add(log)
    session.commit()
    session.refresh(log)

    try:
        payload = fetch_raw()
        log.raw_file = str(save_raw(payload))
        stations_raw = payload.get("stations", [])
        log.stations_seen = len(stations_raw)

        pending: list[tuple[int, datetime, dict]] = []
        for raw in stations_raw:
            station = upsert_station(session, raw)
            if station is None:
                continue
            aqi_last = raw.get("AQILast") or {}
            measured_at = parse_measured_at(aqi_last)
            if measured_at is None:
                continue
            pending.append((station.id, measured_at, aqi_last))

        session.commit()

        # ตรวจว่าชั่วโมงไหนเคยบันทึกแล้วบ้าง แล้วค่อยเพิ่มเฉพาะของใหม่
        # ทำเป็นชุดเดียวเพื่อไม่ต้อง query ทีละสถานี 174 ครั้ง
        timestamps = {item[1] for item in pending}
        existing = set()
        if timestamps:
            rows = session.exec(
                select(Reading.station_id, Reading.measured_at).where(
                    col(Reading.measured_at).in_(timestamps)
                )
            ).all()
            existing = {(row[0], row[1]) for row in rows}

        new_count = 0
        duplicate_count = 0
        for station_id, measured_at, aqi_last in pending:
            if (station_id, measured_at) in existing:
                duplicate_count += 1
                continue
            session.add(
                Reading(
                    station_id=station_id,
                    measured_at=measured_at,
                    pm25=to_float((aqi_last.get("PM25") or {}).get("value")),
                    pm10=to_float((aqi_last.get("PM10") or {}).get("value")),
                    o3=to_float((aqi_last.get("O3") or {}).get("value")),
                    co=to_float((aqi_last.get("CO") or {}).get("value")),
                    no2=to_float((aqi_last.get("NO2") or {}).get("value")),
                    so2=to_float((aqi_last.get("SO2") or {}).get("value")),
                    aqi=to_int((aqi_last.get("AQI") or {}).get("aqi")),
                    aqi_param=((aqi_last.get("AQI") or {}).get("param") or None),
                )
            )
            existing.add((station_id, measured_at))
            new_count += 1

        log.records_new = new_count
        log.records_duplicate = duplicate_count
        log.success = True

    except Exception as exc:  # เก็บความผิดพลาดไว้ใน log แทนที่จะให้โปรแกรมตาย
        session.rollback()
        log = session.get(CollectionLog, log.id)
        log.success = False
        log.error_message = f"{type(exc).__name__}: {exc}"[:500]

    log.finished_at = datetime.now()
    session.add(log)
    session.commit()
    session.refresh(log)
    return log
