"""ตรรกะการคำนวณทั้งหมด แยกออกจากชั้น API เพื่อให้เขียนเทสต์ได้ง่าย"""

import statistics
from datetime import date, datetime, timedelta

from sqlmodel import Session, col, desc, func, select

from app.aqi import LEVELS, describe, level_from_aqi, level_from_pm25
from app.health_advice import (
    RISK_GROUPS,
    THAI_STANDARD_PM25,
    WHO_GUIDELINE_PM25,
    advice_for,
    compare_standards,
)
from app.models import AppUser, CollectionLog, Reading, Station, WeatherDaily

# ถ้าสถานีไม่ส่งข้อมูลใหม่เกินจำนวนชั่วโมงนี้ ถือว่าข้อมูลค้าง ไม่นำมาคิดภาพรวม
STALE_HOURS = 6


def latest_readings(session: Session) -> list[tuple[Station, Reading]]:
    """ค่าตรวจวัดล่าสุดของทุกสถานี

    ใช้ subquery หาเวลาล่าสุดของแต่ละสถานีก่อน แล้วค่อย join กลับ
    เพื่อไม่ต้อง query ทีละสถานี 174 ครั้ง
    """
    newest = (
        select(Reading.station_id, func.max(Reading.measured_at).label("latest"))
        .group_by(Reading.station_id)
        .subquery()
    )
    rows = session.exec(
        select(Station, Reading)
        .join(Reading, col(Reading.station_id) == col(Station.id))
        .join(
            newest,
            (col(Reading.station_id) == newest.c.station_id)
            & (col(Reading.measured_at) == newest.c.latest),
        )
    ).all()
    return list(rows)


def is_stale(reading: Reading, now: datetime | None = None) -> bool:
    """ข้อมูลของสถานีนี้ค้างเก่าเกินกว่าที่ยอมรับได้หรือไม่"""
    reference = now or datetime.now()
    return (reference - reading.measured_at) > timedelta(hours=STALE_HOURS)


def station_payload(station: Station, reading: Reading) -> dict:
    return {
        "station_code": station.station_code,
        "name_th": station.name_th,
        "province": station.province,
        "latitude": station.latitude,
        "longitude": station.longitude,
        "measured_at": reading.measured_at.isoformat(),
        "is_stale": is_stale(reading),
        "pm25": reading.pm25,
        "pm10": reading.pm10,
        "o3": reading.o3,
        "co": reading.co,
        "no2": reading.no2,
        "so2": reading.so2,
        "aqi": reading.aqi,
        "aqi_param": reading.aqi_param,
        "level": describe(reading.aqi, reading.pm25),
    }


def national_summary(session: Session) -> dict:
    """ภาพรวมคุณภาพอากาศทั้งประเทศ ณ ชั่วโมงล่าสุด"""
    rows = latest_readings(session)
    fresh = [(s, r) for s, r in rows if not is_stale(r)]
    values = [r.pm25 for _, r in fresh if r.pm25 is not None]

    counts = {level.key: 0 for level in LEVELS}
    for _, reading in fresh:
        level = level_from_aqi(reading.aqi) or level_from_pm25(reading.pm25)
        if level:
            counts[level.key] += 1

    worst = max(fresh, key=lambda pair: pair[1].pm25 or -1, default=None)
    latest_time = max((r.measured_at for _, r in fresh), default=None)

    return {
        "measured_at": latest_time.isoformat() if latest_time else None,
        "stations_total": len(rows),
        "stations_reporting": len(fresh),
        "stations_stale": len(rows) - len(fresh),
        "pm25_avg": round(statistics.fmean(values), 1) if values else None,
        "pm25_max": round(max(values), 1) if values else None,
        "pm25_min": round(min(values), 1) if values else None,
        "level_counts": counts,
        "levels": [
            {"key": lv.key, "label_th": lv.label_th, "color": lv.color} for lv in LEVELS
        ],
        "worst_station": station_payload(*worst) if worst else None,
    }


def all_stations_latest(session: Session, include_stale: bool = False) -> list[dict]:
    """ค่าล่าสุดของทุกสถานี สำหรับปักหมุดบนแผนที่และแสดงตาราง"""
    rows = latest_readings(session)
    payload = [station_payload(s, r) for s, r in rows if include_stale or not is_stale(r)]
    payload.sort(key=lambda item: item["pm25"] if item["pm25"] is not None else -1, reverse=True)
    return payload


def province_ranking(session: Session) -> list[dict]:
    """อันดับจังหวัดตามค่า PM2.5 เฉลี่ยของสถานีในจังหวัดนั้น"""
    grouped: dict[str, list[float]] = {}
    for station, reading in latest_readings(session):
        if is_stale(reading) or reading.pm25 is None:
            continue
        grouped.setdefault(station.province, []).append(reading.pm25)

    ranking = [
        {
            "province": province,
            "pm25_avg": round(statistics.fmean(values), 1),
            "pm25_max": round(max(values), 1),
            "station_count": len(values),
            "level": describe(None, statistics.fmean(values)),
        }
        for province, values in grouped.items()
    ]
    ranking.sort(key=lambda item: item["pm25_avg"], reverse=True)
    return ranking


def station_history(session: Session, station_code: str, hours: int) -> dict:
    """ประวัติค่าตรวจวัดย้อนหลังของหนึ่งสถานี"""
    station = session.exec(
        select(Station).where(Station.station_code == station_code)
    ).first()
    if station is None:
        return {}

    since = datetime.now() - timedelta(hours=hours)
    readings = session.exec(
        select(Reading)
        .where(Reading.station_id == station.id, col(Reading.measured_at) >= since)
        .order_by(col(Reading.measured_at))
    ).all()

    return {
        "station_code": station.station_code,
        "name_th": station.name_th,
        "province": station.province,
        "latitude": station.latitude,
        "longitude": station.longitude,
        "points": [
            {
                "measured_at": r.measured_at.isoformat(),
                "label": f"{r.measured_at:%H:%M}",
                "pm25": r.pm25,
                "pm10": r.pm10,
                "aqi": r.aqi,
            }
            for r in readings
        ],
    }


def weather_history(session: Session, province: str, days: int) -> dict:
    """ข้อมูลอากาศรายวันย้อนหลังของหนึ่งจังหวัด"""
    since = date.today() - timedelta(days=days)
    rows = session.exec(
        select(WeatherDaily)
        .where(WeatherDaily.province == province, col(WeatherDaily.observed_on) >= since)
        .order_by(col(WeatherDaily.observed_on))
    ).all()
    return {
        "province": province,
        "points": [
            {
                "observed_on": w.observed_on.isoformat(),
                "label": f"{w.observed_on:%d/%m}",
                "temp_avg": w.temp_avg,
                "temp_max": w.temp_max,
                "temp_min": w.temp_min,
                "rainfall_mm": w.rainfall_mm,
                "humidity": w.humidity,
                "wind_speed": w.wind_speed,
            }
            for w in rows
        ],
    }


def normalise_name(name: str) -> str:
    """ตัดช่องว่างหัวท้ายและยุบช่องว่างซ้อนให้เหลือตัวเดียว

    ป้องกันการเกิดผู้ใช้ซ้ำจากการพิมพ์ชื่อเดิมแต่มีช่องว่างต่างกัน
    เช่น "สมชาย  ใจดี" กับ "สมชาย ใจดี" ต้องถือเป็นคนเดียวกัน
    """
    return " ".join(name.split())


def sign_in(session: Session, name: str) -> AppUser | None:
    """เข้าใช้งานด้วยชื่อ ถ้ายังไม่มีชื่อนี้จะสร้างให้ใหม่

    คืนค่า None เมื่อชื่อว่างเปล่า ให้ชั้น API ตอบเป็นข้อผิดพลาด
    """
    cleaned = normalise_name(name)
    if not cleaned:
        return None

    user = session.exec(select(AppUser).where(AppUser.display_name == cleaned)).first()
    if user is None:
        user = AppUser(display_name=cleaned)
    user.last_seen_at = datetime.now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_profile(
    session: Session,
    user_id: int,
    province: str | None,
    risk_group: str | None,
) -> AppUser | None:
    """แก้จังหวัดและกลุ่มเสี่ยงที่ผู้ใช้ตั้งไว้"""
    user = session.get(AppUser, user_id)
    if user is None:
        return None

    valid_groups = {group.key for group in RISK_GROUPS}
    if risk_group is not None and risk_group not in valid_groups:
        raise ValueError(f"ไม่รู้จักกลุ่มเสี่ยง {risk_group}")

    user.province = province
    user.risk_group = risk_group
    user.last_seen_at = datetime.now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def personal_summary(session: Session, user_id: int) -> dict | None:
    """สรุปสถานการณ์และคำแนะนำเฉพาะตัวของผู้ใช้คนหนึ่ง

    ถ้าผู้ใช้ยังไม่ได้ตั้งจังหวัด จะใช้ค่าเฉลี่ยทั้งประเทศแทน
    ถ้ายังไม่ได้ตั้งกลุ่มเสี่ยง จะแสดงคำแนะนำของประชาชนทั่วไป
    """
    user = session.get(AppUser, user_id)
    if user is None:
        return None

    guidance = health_guidance(session, user.province)
    group_key = user.risk_group or "general"
    my_advice = next(
        (item for item in guidance["groups"] if item["key"] == group_key),
        None,
    )

    return {
        "user": {
            "id": user.id,
            "display_name": user.display_name,
            "province": user.province,
            "risk_group": user.risk_group,
        },
        "scope": guidance["scope"],
        "station_count": guidance["station_count"],
        "pm25": guidance["pm25"],
        "level": guidance["level"],
        "standards": guidance["standards"],
        "my_advice": my_advice,
        "all_groups": guidance["groups"],
    }


def health_guidance(session: Session, province: str | None) -> dict:
    """คำแนะนำสุขภาพรายกลุ่มเสี่ยง ตามค่าฝุ่นของจังหวัดที่เลือก

    ถ้าไม่ระบุจังหวัด จะใช้ค่าเฉลี่ยของทั้งประเทศ
    """
    rows = [(s, r) for s, r in latest_readings(session) if not is_stale(r)]
    if province:
        rows = [(s, r) for s, r in rows if s.province == province]

    values = [r.pm25 for _, r in rows if r.pm25 is not None]
    average = round(statistics.fmean(values), 1) if values else None
    level = describe(None, average)

    return {
        "province": province,
        "scope": province or "ทั้งประเทศ",
        "station_count": len(rows),
        "pm25": average,
        "level": level,
        "standards": compare_standards(average),
        "groups": advice_for(level["key"]),
    }


def alerts(session: Session) -> dict:
    """พื้นที่ที่ค่าฝุ่นเกินเกณฑ์ ควรแจ้งเตือนประชาชน

    แบ่งเป็นสองระดับ
        เกินมาตรฐานไทย        ต้องแจ้งเตือนกลุ่มเปราะบางและประชาชนทั่วไป
        เกินค่าแนะนำ WHO      ยังไม่ผิดมาตรฐานไทย แต่มีผลต่อสุขภาพระยะยาว
    """
    rows = [(s, r) for s, r in latest_readings(session) if not is_stale(r)]

    over_thai = []
    over_who = []
    for station, reading in rows:
        if reading.pm25 is None:
            continue
        entry = station_payload(station, reading)
        if reading.pm25 > THAI_STANDARD_PM25:
            over_thai.append(entry)
        elif reading.pm25 > WHO_GUIDELINE_PM25:
            over_who.append(entry)

    over_thai.sort(key=lambda item: item["pm25"], reverse=True)
    over_who.sort(key=lambda item: item["pm25"], reverse=True)

    return {
        "checked_at": datetime.now().isoformat(),
        "stations_checked": len(rows),
        "thai_standard": THAI_STANDARD_PM25,
        "who_guideline": WHO_GUIDELINE_PM25,
        "over_thai_standard": over_thai,
        "over_who_guideline": over_who,
    }


# จำนวนชั่วโมงขั้นต่ำที่ต้องมีในหนึ่งวัน จึงจะถือว่าค่าเฉลี่ยรายวันนั้นใช้อ้างอิงได้
#
# ใช้เกณฑ์ 18 ชั่วโมงจาก 24 ชั่วโมง หรือ 75 เปอร์เซ็นต์ ซึ่งเป็นเกณฑ์ที่ใช้กันทั่วไป
# ในงานด้านคุณภาพอากาศ ถ้าวันไหนมีข้อมูลน้อยกว่านี้ ค่าเฉลี่ยจะเอนไปตามช่วงเวลา
# ที่บังเอิญเก็บได้ เช่นเก็บได้แต่ตอนกลางคืนซึ่งฝุ่นสะสมมากกว่ากลางวัน
MIN_HOURS_PER_DAY = 18


def station_daily(session: Session, station_code: str, days: int) -> dict:
    """ค่าเฉลี่ยรายวันของหนึ่งสถานี

    ทำไมต้องมีค่ารายวัน
        มาตรฐาน PM2.5 ของประเทศไทยที่ 37.5 ไมโครกรัมต่อลูกบาศก์เมตร
        เป็นค่าเฉลี่ย 24 ชั่วโมง ไม่ใช่ค่า ณ ชั่วโมงใดชั่วโมงหนึ่ง
        การเทียบค่ารายชั่วโมงกับมาตรฐานรายวันโดยตรงจึงไม่ถูกต้องตามหลักวิชาการ
    """
    station = session.exec(
        select(Station).where(Station.station_code == station_code)
    ).first()
    if station is None:
        return {}

    since = datetime.now() - timedelta(days=days)
    day = func.date(Reading.measured_at)

    rows = session.exec(
        select(
            day.label("day"),
            func.avg(Reading.pm25),
            func.min(Reading.pm25),
            func.max(Reading.pm25),
            func.count(Reading.pm25),
        )
        .where(
            Reading.station_id == station.id,
            col(Reading.measured_at) >= since,
            col(Reading.pm25).is_not(None),
        )
        .group_by(day)
        .order_by(day)
    ).all()

    points = []
    for value, average, lowest, highest, hours in rows:
        observed = date.fromisoformat(str(value))
        points.append(
            {
                "observed_on": observed.isoformat(),
                "label": f"{observed:%d/%m}",
                "pm25_avg": round(float(average), 1),
                "pm25_min": round(float(lowest), 1),
                "pm25_max": round(float(highest), 1),
                "hours": int(hours),
                # วันที่ชั่วโมงไม่ครบ ค่าเฉลี่ยยังใช้เทียบมาตรฐานไม่ได้
                "complete": int(hours) >= MIN_HOURS_PER_DAY,
                "over_thai_standard": float(average) > THAI_STANDARD_PM25,
            }
        )

    complete_days = [item for item in points if item["complete"]]
    return {
        "station_code": station.station_code,
        "name_th": station.name_th,
        "province": station.province,
        "thai_standard": THAI_STANDARD_PM25,
        "min_hours_per_day": MIN_HOURS_PER_DAY,
        "days_total": len(points),
        "days_complete": len(complete_days),
        "days_over_standard": len([d for d in complete_days if d["over_thai_standard"]]),
        "points": points,
    }


def collection_health(session: Session) -> dict:
    """สถานะการเก็บข้อมูล ใช้รายงานความครบถ้วนของข้อมูลในบทที่ 4

    ความครบถ้วนคำนวณจาก จำนวนแถวที่เก็บได้จริง หารด้วย จำนวนที่ควรจะได้
    (จำนวนสถานี x จำนวนชั่วโมงตั้งแต่เริ่มเก็บ)
    """
    readings_total = session.exec(select(func.count()).select_from(Reading)).one()
    stations_total = session.exec(select(func.count()).select_from(Station)).one()
    span = session.exec(
        select(func.min(Reading.measured_at), func.max(Reading.measured_at))
    ).one()

    started = session.exec(
        select(func.min(CollectionLog.started_at)).where(
            CollectionLog.source == "air4thai", col(CollectionLog.success).is_(True)
        )
    ).one()

    # ความครบถ้วนคือ จำนวนแถวที่ได้จริง เทียบกับ จำนวนชั่วโมงที่ครอบคลุม x จำนวนสถานี
    #
    # จุดเริ่มต้องใช้ measured_at ของข้อมูลชุดแรกที่เก็บได้ ไม่ใช่เวลาที่สคริปต์เริ่มทำงาน
    # เพราะการเก็บครั้งแรกได้ข้อมูลของชั่วโมงที่เกิดขึ้นก่อนหน้านั้นติดมาด้วย
    # ถ้านับจากเวลาที่สคริปต์เริ่ม จำนวนที่ควรได้จะน้อยกว่าของจริงจนเกิน 100%
    #
    # และต้องตัดสถานีที่ส่งข้อมูลค้างมาเป็นเดือนออกจากการหาจุดเริ่ม
    # ไม่เช่นนั้นช่วงเวลาจะยาวผิดปกติจนความครบถ้วนต่ำเกินจริง
    expected = 0
    counted = readings_total
    if started and span[1] and stations_total:
        cutoff = started - timedelta(days=1)
        first_hour = session.exec(
            select(func.min(Reading.measured_at)).where(col(Reading.measured_at) >= cutoff)
        ).one()
        if first_hour:
            hours = max(1, int((span[1] - first_hour).total_seconds() // 3600) + 1)
            expected = hours * stations_total
            counted = session.exec(
                select(func.count())
                .select_from(Reading)
                .where(col(Reading.measured_at) >= first_hour)
            ).one()

    field_completeness = {}
    for field, label in (
        (Reading.pm25, "PM2.5"),
        (Reading.pm10, "PM10"),
        (Reading.o3, "O3"),
        (Reading.co, "CO"),
        (Reading.no2, "NO2"),
        (Reading.so2, "SO2"),
    ):
        have = session.exec(
            select(func.count()).select_from(Reading).where(col(field).is_not(None))
        ).one()
        field_completeness[label] = round(100 * have / readings_total, 1) if readings_total else 0

    logs = session.exec(
        select(CollectionLog).order_by(desc(col(CollectionLog.started_at))).limit(10)
    ).all()

    return {
        "readings_total": int(readings_total),
        "stations_total": int(stations_total),
        "weather_total": int(session.exec(select(func.count()).select_from(WeatherDaily)).one()),
        "collection_started": started.isoformat() if started else None,
        "first_reading": span[0].isoformat() if span[0] else None,
        "last_reading": span[1].isoformat() if span[1] else None,
        "expected_rows": expected,
        "counted_rows": int(counted),
        "completeness_pct": round(100 * counted / expected, 1) if expected else None,
        "field_completeness": field_completeness,
        "recent_runs": [
            {
                "source": log.source,
                "started_at": log.started_at.isoformat(),
                "success": log.success,
                "records_new": log.records_new,
                "records_duplicate": log.records_duplicate,
                "error_message": log.error_message,
            }
            for log in logs
        ],
    }
