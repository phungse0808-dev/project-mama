"""ออกค่าพยากรณ์วันละครั้ง เก็บไว้ แล้วเทียบกับค่าจริงในวันถัดไป

ทำไมต้องออกเป็นรอบ แทนการคำนวณสดทุกครั้งที่เปิดหน้า
    1. ตัวเลขนิ่งทั้งวัน คนที่เปิดตอนเช้ากับตอนเย็นเห็นค่าเดียวกัน
       ถ้าคำนวณสด ค่าจะขยับทุกชั่วโมงตามข้อมูลใหม่ ซึ่งชวนให้เข้าใจว่าระบบไม่นิ่ง
    2. เก็บค่าที่ทายไว้ได้ พอวันรุ่งขึ้นมีค่าจริงก็เทียบได้ทันที
       ความแม่นที่รายงานจึงมาจากการใช้งานจริง ไม่ใช่จากการย้อนทดสอบด้วยสคริปต์อย่างเดียว
    3. ตรงกับวิธีที่หน่วยงานพยากรณ์ใช้ คือออกค่าเป็นรอบตามเวลาที่ประกาศไว้

เวลาที่ออก บ่ายสองโมง เพราะมีข้อมูลครบครึ่งวันแล้ว และยังทันให้คนวางแผนวันรุ่งขึ้น
"""

import logging
from datetime import date, datetime, timedelta

from sqlmodel import Session, col, func, select

from app.aqi import describe
from app.forecast_demo import WINDOW_HOURS, forecast_demo, window_average
from app.models import ForecastIssue, Station

logger = logging.getLogger(__name__)

# ชั่วโมงที่ออกค่าพยากรณ์ประจำวัน เวลาไทย
ISSUE_HOUR = 14

# ต้องมีค่ารายชั่วโมงอย่างน้อยเท่านี้ในช่วง 24 ชม. จึงนับว่าค่าจริงของช่วงนั้นใช้ได้
MIN_READINGS_FOR_ACTUAL = 12


def _coords(session: Session, province: str) -> tuple[float, float] | None:
    row = session.exec(
        select(func.avg(Station.latitude), func.avg(Station.longitude)).where(
            Station.province == province
        )
    ).one()
    if row[0] is None:
        return None
    return float(row[0]), float(row[1])


def provinces_with_stations(session: Session) -> list[str]:
    return sorted(set(session.exec(select(Station.province).distinct()).all()))


def issue_today(session: Session, today: date | None = None) -> int:
    """ออกค่าพยากรณ์ของทุกจังหวัดสำหรับวันนี้ คืนจำนวนแถวที่บันทึกใหม่

    รันซ้ำในวันเดียวกันได้ ของเดิมจะไม่ถูกเขียนทับ เพราะถือว่าค่าที่ออกไปแล้ว
    คือค่าที่ผู้ใช้เห็น จะแก้ย้อนหลังไม่ได้ ไม่งั้นการวัดความแม่นจะไม่มีความหมาย
    """
    today = today or date.today()
    saved = 0

    for province in provinces_with_stations(session):
        already = session.exec(
            select(ForecastIssue).where(
                ForecastIssue.province == province, ForecastIssue.issued_on == today
            )
        ).first()
        if already:
            continue

        data = forecast_demo(session, province, _coords(session, province))
        if not data.get("available"):
            continue

        previous = data.get("previous") or {}
        latest = data.get("latest") or {}
        if previous.get("pm25") is None or latest.get("pm25") is None:
            continue

        for target in ("tomorrow", "day_after"):
            block = data.get(target)
            if not block or block.get("pm25") is None:
                continue
            session.add(
                ForecastIssue(
                    province=province,
                    issued_on=today,
                    target=target,
                    window_start=datetime.fromisoformat(block["start"]),
                    window_end=datetime.fromisoformat(block["end"]),
                    pm25=float(block["pm25"]),
                    previous_pm25=float(previous["pm25"]),
                    latest_pm25=float(latest["pm25"]),
                )
            )
            saved += 1

    if saved:
        session.commit()
    return saved


def fill_actuals(session: Session, now: datetime | None = None) -> int:
    """เติมค่าจริงให้ค่าพยากรณ์ที่ช่วงเวลาผ่านไปแล้ว คืนจำนวนแถวที่เติมได้"""
    now = now or datetime.now()
    rows = session.exec(
        select(ForecastIssue).where(
            col(ForecastIssue.actual_pm25).is_(None),
            ForecastIssue.window_end <= now,
        )
    ).all()

    filled = 0
    for row in rows:
        average, readings, _ = window_average(
            session, row.province, row.window_start, row.window_end
        )
        if average is None or readings < MIN_READINGS_FOR_ACTUAL:
            continue
        row.actual_pm25 = average
        row.checked_at = now
        session.add(row)
        filled += 1

    if filled:
        session.commit()
    return filled


def latest_issue(session: Session, province: str) -> dict | None:
    """ค่าที่ออกไว้ล่าสุดของจังหวัดนี้ พร้อมผลเทียบของรอบก่อนหน้า"""
    rows = session.exec(
        select(ForecastIssue)
        .where(ForecastIssue.province == province)
        .order_by(col(ForecastIssue.issued_on).desc(), col(ForecastIssue.target))
    ).all()
    if not rows:
        return None

    issued_on = rows[0].issued_on
    current = {row.target: row for row in rows if row.issued_on == issued_on}

    # รอบก่อนหน้าที่มีค่าจริงแล้ว ใช้แสดงว่าทายไว้เท่าไรและจริงเท่าไร
    checked = next(
        (
            row
            for row in rows
            if row.target == "tomorrow" and row.actual_pm25 is not None
        ),
        None,
    )

    # ค่าที่วัดได้จริงสองช่วงก่อนหน้า ณ เวลาที่ออกค่า
    #
    # เก็บไว้ในแถวเดียวกับค่าพยากรณ์อยู่แล้ว จึงไม่ต้องคำนวณใหม่
    # ต้องแสดงค่าชุดนี้ ไม่ใช่ค่าที่คำนวณสด เพราะการ์ดทั้งสี่ใบต้องเป็นภาพของรอบเดียวกัน
    # ถ้าสองใบแรกขยับทุกชั่วโมงแต่สองใบหลังนิ่ง ช่วงเวลาจะไม่ต่อกันและอ่านแล้วสับสน
    anchor = current.get("tomorrow")
    observed = None
    if anchor is not None:
        latest_start = anchor.window_start - timedelta(hours=WINDOW_HOURS)
        latest_end = anchor.window_end - timedelta(hours=WINDOW_HOURS)
        observed = {
            "previous": {
                "pm25": anchor.previous_pm25,
                "start": (latest_start - timedelta(hours=WINDOW_HOURS)).isoformat(timespec="minutes"),
                "end": (latest_end - timedelta(hours=WINDOW_HOURS)).isoformat(timespec="minutes"),
                "level": describe(None, anchor.previous_pm25),
            },
            "latest": {
                "pm25": anchor.latest_pm25,
                "start": latest_start.isoformat(timespec="minutes"),
                "end": latest_end.isoformat(timespec="minutes"),
                "level": describe(None, anchor.latest_pm25),
            },
        }

    return {
        "issued_on": issued_on.isoformat(),
        "observed": observed,
        "issued_at": current[next(iter(current))].issued_at.isoformat(timespec="minutes"),
        "issue_hour": ISSUE_HOUR,
        "targets": {
            target: {
                "pm25": row.pm25,
                "start": row.window_start.isoformat(timespec="minutes"),
                "end": row.window_end.isoformat(timespec="minutes"),
            }
            for target, row in current.items()
        },
        "last_checked": (
            {
                "issued_on": checked.issued_on.isoformat(),
                "predicted": checked.pm25,
                "actual": checked.actual_pm25,
                "error": round(abs(checked.pm25 - checked.actual_pm25), 2),
            }
            if checked
            else None
        ),
    }


def scoreboard(session: Session) -> dict:
    """สรุปความแม่นจากค่าที่ระบบออกไปจริงและมีค่าจริงมาเทียบแล้ว"""
    rows = session.exec(
        select(ForecastIssue).where(col(ForecastIssue.actual_pm25).is_not(None))
    ).all()
    if not rows:
        return {"available": False, "reason": "ยังไม่มีรอบที่ครบกำหนดให้เทียบ"}

    errors = [abs(row.pm25 - row.actual_pm25) for row in rows if row.actual_pm25 is not None]
    return {
        "available": True,
        "checked": len(errors),
        "provinces": len({row.province for row in rows}),
        "mae": round(sum(errors) / len(errors), 2),
        "days": len({row.issued_on for row in rows}),
    }


def run_daily(session: Session, now: datetime | None = None) -> tuple[int, int]:
    """งานประจำที่ตัวเก็บข้อมูลเรียกทุกชั่วโมง

    ออกค่าเฉพาะเมื่อถึงชั่วโมงที่กำหนดและยังไม่ได้ออกของวันนี้
    ส่วนการเติมค่าจริงทำได้ทุกชั่วโมง เพราะยิ่งเติมเร็วยิ่งเห็นผลเร็ว
    """
    now = now or datetime.now()
    issued = issue_today(session, now.date()) if now.hour >= ISSUE_HOUR else 0
    filled = fill_actuals(session, now)
    if issued:
        logger.info("ออกค่าพยากรณ์ประจำวัน %s แถว", issued)
    if filled:
        logger.info("เติมค่าจริงให้ค่าพยากรณ์เดิม %s แถว", filled)
    return issued, filled
