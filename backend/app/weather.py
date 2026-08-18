"""ดึงข้อมูลอากาศรายวันจาก NASA POWER

ทำไมต้องใช้ NASA POWER
    - เปิดให้ใช้ฟรี ไม่ต้องสมัคร ไม่ต้องใช้ API key
    - มีข้อมูลย้อนหลังตั้งแต่ปี 1981 ซึ่งกรมอุตุนิยมวิทยาไม่เปิดให้ดึงง่ายขนาดนี้
    - ระบุพิกัดใดก็ได้ ไม่จำกัดว่าต้องมีสถานีตรวจวัดจริงในจุดนั้น

ตัวแปรที่ดึงมาถูกเลือกเพราะมีผลต่อการสะสมของฝุ่นละอองโดยตรง
    ความเร็วลม   ลมแรงพัดฝุ่นกระจาย ลมนิ่งทำให้ฝุ่นสะสม
    ปริมาณฝน     ฝนชะล้างฝุ่นออกจากอากาศ
    อุณหภูมิ     ความต่างอุณหภูมิกลางวันกลางคืนสัมพันธ์กับชั้นอากาศผกผัน
    ความชื้น     มีผลต่อการรวมตัวของอนุภาค
"""

import time
from datetime import date, datetime

import requests
from sqlmodel import Session, col, func, select

from app.config import NASA_PARAMS, NASA_POWER_URL, REQUEST_TIMEOUT
from app.models import CollectionLog, Station, WeatherDaily

# NASA POWER ใช้ -999 แทนค่าที่ไม่มีข้อมูล
NASA_MISSING = -999.0

FIELD_MAP = {
    "T2M": "temp_avg",
    "T2M_MAX": "temp_max",
    "T2M_MIN": "temp_min",
    "PRECTOTCORR": "rainfall_mm",
    "RH2M": "humidity",
    "WS2M": "wind_speed",
    "PS": "pressure",
}


def province_points(session: Session) -> list[tuple[str, float, float]]:
    """หาพิกัดตัวแทนของแต่ละจังหวัด โดยเฉลี่ยจากสถานีตรวจวัดในจังหวัดนั้น"""
    rows = session.exec(
        select(
            Station.province,
            func.avg(Station.latitude),
            func.avg(Station.longitude),
        ).group_by(Station.province)
    ).all()
    return [(row[0], round(float(row[1]), 4), round(float(row[2]), 4)) for row in rows]


def clean(raw: object) -> float | None:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return None if value <= NASA_MISSING else value


def fetch_point(latitude: float, longitude: float, start: date, end: date) -> dict:
    """ดึงข้อมูลอากาศรายวันของพิกัดหนึ่งจุดในช่วงวันที่กำหนด"""
    response = requests.get(
        NASA_POWER_URL,
        params={
            "parameters": NASA_PARAMS,
            "community": "AG",
            "latitude": latitude,
            "longitude": longitude,
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()


def collect(session: Session, start: date, end: date, pause: float = 1.0) -> CollectionLog:
    """ดึงข้อมูลอากาศของทุกจังหวัดที่มีสถานีตรวจวัด"""
    log = CollectionLog(source="nasa_power")
    session.add(log)
    session.commit()
    session.refresh(log)

    points = province_points(session)
    log.stations_seen = len(points)
    new_count = 0
    duplicate_count = 0
    failures: list[str] = []

    for index, (province, latitude, longitude) in enumerate(points, start=1):
        try:
            payload = fetch_point(latitude, longitude, start, end)
            parameters = payload.get("properties", {}).get("parameter", {})
            if not parameters:
                failures.append(province)
                continue

            existing = set(
                session.exec(
                    select(WeatherDaily.observed_on).where(WeatherDaily.province == province)
                ).all()
            )

            days = sorted(next(iter(parameters.values())).keys())
            for day_text in days:
                observed_on = datetime.strptime(day_text, "%Y%m%d").date()
                if observed_on in existing:
                    duplicate_count += 1
                    continue

                values = {
                    field: clean(parameters.get(key, {}).get(day_text))
                    for key, field in FIELD_MAP.items()
                }
                session.add(
                    WeatherDaily(
                        province=province,
                        observed_on=observed_on,
                        latitude=latitude,
                        longitude=longitude,
                        **values,
                    )
                )
                existing.add(observed_on)
                new_count += 1

            session.commit()
            print(f"  [{index:>2}/{len(points)}] {province:<18s} เสร็จ")

        except Exception as exc:
            session.rollback()
            failures.append(f"{province} ({type(exc).__name__})")
            print(f"  [{index:>2}/{len(points)}] {province:<18s} ล้มเหลว: {type(exc).__name__}")

        time.sleep(pause)  # เว้นจังหวะไม่ให้ยิงถี่เกินไปจนถูกปฏิเสธ

    log.records_new = new_count
    log.records_duplicate = duplicate_count
    log.success = len(failures) < len(points)
    if failures:
        log.error_message = f"ล้มเหลว {len(failures)} จังหวัด: {', '.join(failures[:10])}"[:500]
    log.finished_at = datetime.now()
    session.add(log)
    session.commit()
    session.refresh(log)
    return log


def latest_observed(session: Session) -> date | None:
    """วันล่าสุดที่มีข้อมูลอากาศแล้ว ใช้ดึงต่อจากจุดที่ค้างไว้"""
    return session.exec(select(func.max(col(WeatherDaily.observed_on)))).one()
