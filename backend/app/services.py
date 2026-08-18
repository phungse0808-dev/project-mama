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
from app.regions import ALIASES, region_of
from app.models import AppUser, CollectionLog, DiseaseDaily, HivStatistic, Reading, Station, WeatherDaily

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
        "weather": national_weather(session),
    }


def all_stations_latest(session: Session, include_stale: bool = False) -> list[dict]:
    """ค่าล่าสุดของทุกสถานี สำหรับปักหมุดบนแผนที่และแสดงตาราง"""
    rows = latest_readings(session)
    payload = [station_payload(s, r) for s, r in rows if include_stale or not is_stale(r)]
    payload.sort(key=lambda item: item["pm25"] if item["pm25"] is not None else -1, reverse=True)
    return payload


def national_weather(session: Session) -> dict | None:
    """สภาพอากาศเฉลี่ยทั้งประเทศของวันล่าสุดที่มีข้อมูลครบ

    ใช้วันล่าสุดที่มีค่าครบทุกจังหวัด ไม่ใช่วันล่าสุดเฉยๆ
    เพราะ NASA POWER ทยอยเผยแพร่ วันล่าสุดจึงมักมีบางจังหวัดที่ค่ายังว่าง
    ถ้าเฉลี่ยจากวันนั้นจะได้ค่าที่มาจากพื้นที่ไม่ครบ แล้วเทียบข้ามวันไม่ได้

    โอกาสฝนตกคิดจากสัดส่วนจังหวัดที่วันนั้นวัดฝนได้ตั้งแต่เกณฑ์ขึ้นไป
    ต่างจากโอกาสฝนตกรายจังหวัดซึ่งคิดจากสถิติย้อนหลังหลายปี
    ตัวนี้บอกว่าวันนั้นฝนตกครอบคลุมพื้นที่แค่ไหน ไม่ใช่ความน่าจะเป็น
    """
    rows = session.exec(select(WeatherDaily)).all()
    if not rows:
        return None

    per_day: dict[date, list[WeatherDaily]] = {}
    for row in rows:
        if row.temp_avg is not None:
            per_day.setdefault(row.observed_on, []).append(row)
    if not per_day:
        return None

    # จำนวนจังหวัดที่ระบบเก็บข้อมูลอากาศไว้ ใช้เป็นเกณฑ์ว่าวันไหนครบ
    expected = len({row.province for row in rows})
    complete = [day for day, items in per_day.items() if len(items) >= expected]
    target = max(complete) if complete else max(per_day)
    items = per_day[target]

    def mean_of(field: str) -> float | None:
        values = [getattr(i, field) for i in items if getattr(i, field) is not None]
        return round(statistics.fmean(values), 1) if values else None

    rained = [i for i in items if i.rainfall_mm is not None and i.rainfall_mm >= RAIN_DAY_MM]

    return {
        "observed_on": target.isoformat(),
        "days_behind": (date.today() - target).days,
        "provinces": len(items),
        "temp_avg": mean_of("temp_avg"),
        "humidity": mean_of("humidity"),
        "wind_speed": mean_of("wind_speed"),
        "rainfall_mm": mean_of("rainfall_mm"),
        "rain_area_pct": round(len(rained) / len(items) * 100, 1) if items else None,
    }


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


def region_ranking(session: Session) -> list[dict]:
    """ค่าฝุ่นเฉลี่ยรายภาค

    ใช้ค่าเฉลี่ยของทุกสถานีในภาคนั้น ไม่ใช่ค่าเฉลี่ยของค่าเฉลี่ยรายจังหวัด
    เพราะจังหวัดที่มีสถานีเดียวไม่ควรมีน้ำหนักเท่ากับจังหวัดที่มีสิบสถานี
    การเฉลี่ยจากสถานีโดยตรงจึงสะท้อนพื้นที่ที่วัดได้จริงมากกว่า

    หมายเหตุสำหรับการตีความ
        สถานีตรวจวัดกระจายไม่เท่ากันในแต่ละภาค ภาคที่มีสถานีน้อย
        ค่าเฉลี่ยจะอ่อนไหวต่อสถานีเดียวมาก จึงคืนจำนวนสถานีไปด้วยเสมอ
        เพื่อให้หน้าเว็บบอกผู้อ่านได้ว่าตัวเลขนั้นมาจากกี่จุด
    """
    grouped: dict[str, list[float]] = {}
    provinces: dict[str, set[str]] = {}

    for station, reading in latest_readings(session):
        if is_stale(reading) or reading.pm25 is None:
            continue
        region = region_of(station.province)
        if region is None:
            continue
        grouped.setdefault(region, []).append(reading.pm25)
        provinces.setdefault(region, set()).add(station.province)

    ranking = [
        {
            "region": region,
            "pm25_avg": round(statistics.fmean(values), 1),
            "pm25_max": round(max(values), 1),
            "pm25_min": round(min(values), 1),
            "station_count": len(values),
            "province_count": len(provinces[region]),
            "level": describe(None, statistics.fmean(values)),
        }
        for region, values in grouped.items()
    ]
    ranking.sort(key=lambda item: item["pm25_avg"], reverse=True)
    return ranking


# เกณฑ์นับว่าเป็น "วันฝนตก" ใช้ 1.0 มิลลิเมตรตามนิยามของ WMO
#
# ต่ำกว่านี้คือฝนประปรายที่วัดได้แต่แทบไม่มีผลต่อการชะฝุ่นหรือการใช้ชีวิต
# ถ้าใช้เกณฑ์ 0 จะได้ตัวเลขสูงเกินจริงเพราะนับวันที่มีละอองน้ำเล็กน้อยด้วย
RAIN_DAY_MM = 1.0

# ช่วงวันที่นำมาคิด นับจากวันเดียวกันของทุกปีบวกลบ 3 วัน
#
# ที่ต้องเผื่อช่วงเพราะถ้าใช้วันเดียวเป๊ะ จะได้ตัวอย่างแค่ปีละหนึ่งวัน
# รวม 6 ปีก็เพียง 6 ตัวอย่าง ซึ่งน้อยเกินกว่าจะเชื่อถือได้
# การเผื่อบวกลบ 3 วันทำให้ได้ราว 42 ตัวอย่าง โดยยังอยู่ในช่วงฤดูกาลเดียวกัน
RAIN_WINDOW_DAYS = 3


def rain_chance(session: Session, province: str) -> dict:
    """โอกาสที่ฝนจะตกในจังหวัดนั้นสำหรับวันนี้ คิดจากสถิติย้อนหลัง

    สำคัญมากสำหรับการตีความ
        ตัวเลขนี้ไม่ใช่การพยากรณ์อากาศ เป็นความถี่ที่เคยเกิดขึ้นจริงในอดีต
        ของช่วงวันเดียวกันในปีก่อนๆ ซึ่งเรียกว่าความน่าจะเป็นเชิงภูมิอากาศ

        ต่างจากพยากรณ์ตรงที่ไม่ได้ดูสภาพบรรยากาศจริงในขณะนี้เลย
        จึงบอกได้แค่ว่าช่วงนี้ของปีฝนมักตกบ่อยแค่ไหน ไม่ได้บอกว่าวันนี้จะตกหรือไม่

        ระบบนี้ไม่มีข้อมูลพยากรณ์ เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลย้อนหลัง
        และตามหลังปัจจุบันอยู่ราวสามถึงห้าวัน
    """
    today = date.today()
    target = today.timetuple().tm_yday

    rows = session.exec(
        select(WeatherDaily).where(WeatherDaily.province == province)
    ).all()
    if not rows:
        return {"available": False, "reason": f"ไม่มีข้อมูลอากาศของจังหวัด{province}"}

    def in_window(day: date) -> bool:
        """อยู่ในช่วงวันเดียวกันของปีหรือไม่ เผื่อการข้ามปีตอนต้นและปลายปี"""
        gap = abs(day.timetuple().tm_yday - target)
        return min(gap, 365 - gap) <= RAIN_WINDOW_DAYS

    same_season = [row for row in rows if row.rainfall_mm is not None and in_window(row.observed_on)]
    if not same_season:
        return {"available": False, "reason": "ไม่มีข้อมูลของช่วงวันนี้ในปีก่อนๆ"}

    wet = [row for row in same_season if row.rainfall_mm >= RAIN_DAY_MM]
    years = sorted({row.observed_on.year for row in same_season})

    # ค่าเฉลี่ยรายเดือนไว้เทียบให้เห็นว่าเดือนนี้อยู่ตรงไหนของทั้งปี
    per_month: dict[int, list[float]] = {}
    for row in rows:
        if row.rainfall_mm is not None:
            per_month.setdefault(row.observed_on.month, []).append(row.rainfall_mm)

    monthly = [
        {
            "month": month,
            "label": THAI_MONTH_NAMES[month - 1],
            "chance_pct": round(
                len([v for v in values if v >= RAIN_DAY_MM]) / len(values) * 100, 1
            ),
            "rainfall_avg_mm": round(statistics.fmean(values), 1),
        }
        for month, values in sorted(per_month.items())
    ]

    # สภาพอากาศของวันล่าสุดที่มีข้อมูล พร้อมบอกวันที่กำกับเสมอ
    #
    # ต้องบอกวันที่เพราะ NASA POWER ตามหลังปัจจุบันราวสามถึงห้าวัน
    # ถ้าแสดงเฉยๆ ผู้อ่านจะเข้าใจว่าเป็นสภาพอากาศของตอนนี้
    # ต้องเลือกวันล่าสุดที่ "มีค่าจริง" ไม่ใช่วันล่าสุดเฉยๆ
    #
    # NASA POWER เผยแพร่วันล่าสุดแบบยังไม่ครบทุกพื้นที่ พบว่าวันล่าสุด
    # มีถึง 43 จาก 74 จังหวัดที่ทุกค่ายังว่าง ถ้าหยิบวันล่าสุดตรงๆ
    # หน้าเว็บจะขึ้นขีดกลางทุกช่องทั้งที่ข้อมูลของวันก่อนหน้ามีครบ
    measured = [row for row in rows if row.temp_avg is not None]
    newest = max(measured or rows, key=lambda row: row.observed_on)
    latest = {
        "observed_on": newest.observed_on.isoformat(),
        "days_behind": (today - newest.observed_on).days,
        "temp_avg": newest.temp_avg,
        "temp_max": newest.temp_max,
        "temp_min": newest.temp_min,
        "rainfall_mm": newest.rainfall_mm,
        "humidity": newest.humidity,
        "wind_speed": newest.wind_speed,
        "pressure": newest.pressure,
    }

    # ค่าปกติของช่วงนี้ในรอบหลายปี ไว้เทียบว่าวันล่าสุดผิดปกติหรือไม่
    def season_mean(field: str) -> float | None:
        values = [
            getattr(row, field) for row in same_season if getattr(row, field) is not None
        ]
        return round(statistics.fmean(values), 1) if values else None

    normal = {
        "temp_avg": season_mean("temp_avg"),
        "humidity": season_mean("humidity"),
        "wind_speed": season_mean("wind_speed"),
    }

    return {
        "available": True,
        "province": province,
        "for_date": today.isoformat(),
        "latest": latest,
        "normal": normal,
        "chance_pct": round(len(wet) / len(same_season) * 100, 1),
        "rain_days": len(wet),
        "samples": len(same_season),
        "years": years,
        "window_days": RAIN_WINDOW_DAYS,
        "threshold_mm": RAIN_DAY_MM,
        "rainfall_avg_mm": round(statistics.fmean([r.rainfall_mm for r in same_season]), 1),
        "monthly": monthly,
        "this_month": today.month,
    }


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


def hiv_statistics(session: Session) -> dict:
    """สถิติผู้ติดเชื้อเอชไอวีรายจังหวัด เฉพาะปีล่าสุดที่มีข้อมูล"""
    latest_year = session.exec(select(func.max(HivStatistic.year))).one()
    if latest_year is None:
        return {"year": None, "provinces": [], "source": None}

    rows = session.exec(
        select(HivStatistic)
        .where(HivStatistic.year == latest_year)
        .order_by(desc(col(HivStatistic.rate_per_100k)))
    ).all()

    return {
        "regions": [
            {"name": name, "aliases": list(words)} for name, words in ALIASES.items()
        ],
        "year": latest_year,
        "source": rows[0].source if rows else None,
        "provinces": [
            {
                "province": row.province,
                "cases": row.cases,
                "rate_per_100k": row.rate_per_100k,
                "note": row.note,
            "region": region_of(row.province),
            }
            for row in rows
        ],
    }


def _normalise(value: float, low: float, high: float) -> float:
    """ปรับค่าให้อยู่ในช่วง 0 ถึง 1 เพื่อให้นำตัวแปรคนละหน่วยมารวมกันได้"""
    if high <= low:
        return 0.0
    return (value - low) / (high - low)


def vulnerability_index(session: Session) -> dict:
    """จัดลำดับจังหวัดที่ควรได้รับการเฝ้าระวังคุณภาพอากาศก่อน

    แนวคิด
        ความเสี่ยงต่อสุขภาพจากฝุ่นไม่ได้ขึ้นกับระดับฝุ่นอย่างเดียว แต่ขึ้นกับว่า
        ในพื้นที่นั้นมีประชากรที่เปราะบางต่อฝุ่นมากแค่ไหนด้วย จังหวัดที่ฝุ่นปานกลาง
        แต่มีผู้มีภูมิคุ้มกันบกพร่องอยู่มาก อาจต้องเฝ้าระวังก่อนจังหวัดที่ฝุ่นสูงกว่า
        แต่มีประชากรกลุ่มนี้น้อย

    วิธีคำนวณ
        ปรับค่าฝุ่นเฉลี่ยและอัตราผู้ติดเชื้อต่อประชากรแสนคนให้อยู่ในช่วง 0 ถึง 1
        แล้วถ่วงน้ำหนักเท่ากันคนละครึ่ง ได้คะแนน 0 ถึง 100

    ข้อจำกัดที่ต้องระบุในเล่ม
        การถ่วงน้ำหนักเท่ากันเป็นการตั้งสมมติฐานเอง ไม่ได้มาจากผลการศึกษาทางระบาดวิทยา
        ดัชนีนี้จึงใช้เพื่อจัดลำดับความสำคัญในการเฝ้าระวังเท่านั้น
        ไม่ใช่การประเมินความเสี่ยงทางการแพทย์
    """
    hiv = hiv_statistics(session)
    if not hiv["provinces"]:
        return {
            "available": False,
            "reason": "ยังไม่ได้นำเข้าข้อมูลผู้ติดเชื้อเอชไอวีรายจังหวัด",
            "year": None,
            "provinces": [],
        }

    pm_by_province = {item["province"]: item["pm25_avg"] for item in province_ranking(session)}
    hiv_by_province = {
        item["province"]: item["rate_per_100k"]
        for item in hiv["provinces"]
        if item["rate_per_100k"] is not None
    }

    shared = sorted(set(pm_by_province) & set(hiv_by_province))
    if not shared:
        return {
            "available": False,
            "reason": "ไม่มีจังหวัดที่มีข้อมูลครบทั้งค่าฝุ่นและสถิติผู้ติดเชื้อ",
            "year": hiv["year"],
            "provinces": [],
        }

    pm_values = [pm_by_province[p] for p in shared]
    hiv_values = [hiv_by_province[p] for p in shared]
    pm_low, pm_high = min(pm_values), max(pm_values)
    hiv_low, hiv_high = min(hiv_values), max(hiv_values)

    result = []
    for province in shared:
        pm25 = pm_by_province[province]
        rate = hiv_by_province[province]
        score = 100 * (
            0.5 * _normalise(pm25, pm_low, pm_high) + 0.5 * _normalise(rate, hiv_low, hiv_high)
        )
        result.append(
            {
                "province": province,
                "pm25_avg": pm25,
                "hiv_rate_per_100k": rate,
                "score": round(score, 1),
                "level": describe(None, pm25),
            }
        )

    result.sort(key=lambda item: item["score"], reverse=True)
    return {
        "available": True,
        "reason": None,
        "year": hiv["year"],
        "source": hiv["source"],
        "province_count": len(result),
        "provinces": result,
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


# ---------- ผลกระทบทางสุขภาพจากฝุ่น ----------

THAI_MONTH_NAMES = (
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
)


def _thai_month_label(year: int, month: int) -> str:
    """แปลงปีเป็นพุทธศักราชและย่อชื่อเดือน เช่น 2023-01 เป็น ม.ค. 66"""
    return f"{THAI_MONTH_NAMES[month - 1]} {(year + 543) % 100:02d}"


def disease_summary(session: Session) -> dict:
    """สรุปจำนวนผู้ป่วยกลุ่มโรคที่เกี่ยวข้องกับฝุ่น รายเดือน พร้อมสภาพอากาศเดือนนั้น

    ทำไมต้องแสดงคู่กับสภาพอากาศ
        ตัวเลขผู้ป่วยอย่างเดียวบอกได้แค่ว่ามีคนป่วยเท่าไร แต่ไม่ได้บอกว่าเพราะอะไร
        เมื่อวางคู่กับปริมาณฝนของเดือนเดียวกัน จะเห็นว่าเดือนที่ฝนน้อยซึ่งฝุ่นสะสม
        มีผู้ป่วยมากกว่าเดือนที่ฝนชะฝุ่นลงไปหรือไม่

        เป็นการเปรียบเทียบเชิงพรรณนา ไม่ใช่การพิสูจน์เชิงสาเหตุ เพราะยังมีปัจจัยอื่น
        เช่นฤดูกาลของโรคติดเชื้อ และจำนวนวันทำการของสถานพยาบาล
    """
    rows = session.exec(select(DiseaseDaily)).all()
    if not rows:
        return {"available": False, "reason": "ยังไม่ได้นำเข้าข้อมูล", "monthly": []}

    provinces = sorted({row.province for row in rows})
    groups = sorted({row.disease_group for row in rows})

    # รวมยอดรายเดือน แยกตามกลุ่มโรค
    per_month: dict[tuple[int, int], dict[str, int]] = {}
    for row in rows:
        key = (row.observed_on.year, row.observed_on.month)
        per_month.setdefault(key, {})
        bucket = per_month[key]
        bucket[row.disease_group] = bucket.get(row.disease_group, 0) + row.cases

    # สภาพอากาศเฉลี่ยของเดือนเดียวกัน เฉพาะจังหวัดที่มีข้อมูลผู้ป่วย
    weather = session.exec(
        select(WeatherDaily).where(col(WeatherDaily.province).in_(provinces))
    ).all()
    per_month_weather: dict[tuple[int, int], list[WeatherDaily]] = {}
    for item in weather:
        key = (item.observed_on.year, item.observed_on.month)
        per_month_weather.setdefault(key, []).append(item)

    def mean_of(items: list[WeatherDaily], field: str) -> float | None:
        values = [getattr(i, field) for i in items if getattr(i, field) is not None]
        return round(statistics.mean(values), 2) if values else None

    monthly = []
    for (year, month) in sorted(per_month):
        counts = per_month[(year, month)]
        same_month = per_month_weather.get((year, month), [])
        monthly.append({
            "month": f"{year}-{month:02d}",
            "label": _thai_month_label(year, month),
            "groups": {group: counts.get(group, 0) for group in groups},
            "total": sum(counts.values()),
            "rainfall_mm": mean_of(same_month, "rainfall_mm"),
            "wind_speed": mean_of(same_month, "wind_speed"),
            "humidity": mean_of(same_month, "humidity"),
        })

    by_province = sorted(
        (
            {"province": p, "cases": sum(r.cases for r in rows if r.province == p)}
            for p in provinces
        ),
        key=lambda item: item["cases"],
        reverse=True,
    )

    by_group = sorted(
        (
            {"group": g, "cases": sum(r.cases for r in rows if r.disease_group == g)}
            for g in groups
        ),
        key=lambda item: item["cases"],
        reverse=True,
    )

    days = sorted({row.observed_on for row in rows})
    return {
        "available": True,
        "source": rows[0].source,
        "provinces": provinces,
        "groups": groups,
        "period": {"start": days[0].isoformat(), "end": days[-1].isoformat()},
        "total_cases": sum(row.cases for row in rows),
        "monthly": monthly,
        "by_province": by_province,
        "by_group": by_group,
    }
