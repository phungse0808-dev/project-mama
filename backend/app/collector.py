"""ตัวเก็บข้อมูลเบื้องหลัง ทำงานเองทุกชั่วโมงตราบใดที่เซิร์ฟเวอร์เปิดอยู่

ทำไมต้องมี
    เดิมข้อมูลใหม่เข้าฐานข้อมูลได้สองทาง ทั้งสองทางมีเงื่อนไขที่ทำให้ข้อมูลค้าง

    ทางแรก ผู้ใช้สั่งนำเข้าเองด้วย sync_data.bat ซึ่งต้องมีคนจำและสั่ง
    ทางที่สอง ระบบดึงสดตอนมีคนเปิดหน้าเว็บ แต่ต้องรอให้ข้อมูลเก่าเกินเจ็ดสิบนาทีก่อน
    และถ้าไม่มีใครเปิดหน้าเว็บเลย ข้อมูลก็ไม่เข้า

    ผลคือค่าที่คำนวณจากข้อมูลจริง เช่น ค่าชดเชยของแบบจำลองพยากรณ์
    คิดจากข้อมูลที่ค้างอยู่ ทั้งที่ต้นทางออกข้อมูลใหม่ทุกชั่วโมงแล้ว

    โมดูลนี้ทำให้ข้อมูลใหม่เข้าฐานข้อมูลเองทันทีที่ต้นทางออก
    โดยไม่ต้องรอให้ใครสั่งและไม่ต้องรอให้ใครเปิดหน้าเว็บ
    ค่าที่คำนวณต่อจากข้อมูลจึงเป็นค่าล่าสุดเสมอ เพราะทุกส่วนคำนวณสดตอนถูกเรียก

ความสัมพันธ์กับบอทบน GitHub
    ไม่ได้แทนกัน แต่เสริมกัน
    บอทบน GitHub เก็บเป็นไฟล์ CSV ไว้ในคลังโค้ด ทำงานแม้เครื่องนี้ปิด
    เป็นการสำรองระยะยาวที่กู้ฐานข้อมูลคืนได้ทั้งหมด

    ตัวนี้เก็บลงฐานข้อมูลของเครื่องที่รันอยู่ ให้หน้าเว็บใช้ได้ทันที
    ถ้าเครื่องปิด ตัวนี้หยุด แต่บอทยังเก็บต่อ พอเปิดเครื่องแล้วนำเข้าย้อนหลังได้ครบ
"""

import asyncio
import logging
from contextlib import suppress
from datetime import datetime

from sqlmodel import Session, select

from app.db import engine

logger = logging.getLogger(__name__)

# เผื่อเวลาหลังต้นชั่วโมงก่อนไปถาม
#
# ต้นทางประกาศว่าออกข้อมูลรายชั่วโมง แต่ของจริงมักออกช้ากว่าเวลาที่ระบุหลายนาที
# ถ้าไปถามตรงต้นชั่วโมงพอดีจะได้ข้อมูลชั่วโมงเดิมกลับมา แล้วต้องรออีกชั่วโมง
SETTLE_SECONDS = 5 * 60

# เวลารอเมื่อเก็บไม่สำเร็จ
#
# สั้นกว่าหนึ่งชั่วโมงเพื่อให้ได้ข้อมูลชั่วโมงนั้นทันถ้าปัญหาหายไปเร็ว
# แต่ไม่สั้นจนกลายเป็นถามซ้ำถี่ ๆ ตอนที่ต้นทางล่มยาว
RETRY_SECONDS = 10 * 60


def seconds_until_next_run(now: datetime | None = None) -> float:
    """เวลาที่เหลือก่อนถึงรอบเก็บถัดไป นับจากต้นชั่วโมงถัดไปบวกเวลาเผื่อ"""
    now = now or datetime.now()
    seconds_into_hour = now.minute * 60 + now.second

    # ยังไม่ถึงเวลาเก็บของชั่วโมงนี้ ก็รอถึงเวลานั้น
    if seconds_into_hour < SETTLE_SECONDS:
        return SETTLE_SECONDS - seconds_into_hour

    # เลยเวลาของชั่วโมงนี้แล้ว ไปรอของชั่วโมงถัดไป
    return 3600 - seconds_into_hour + SETTLE_SECONDS


def record_wind(session: Session) -> int:
    """บันทึกลมของทุกจังหวัด ณ ชั่วโมงนี้ คืนจำนวนแถวที่เพิ่มใหม่

    ทำไมเก็บพร้อมรอบเดียวกับค่าฝุ่น
        ข้อมูลลมย้อนหลังที่มีอยู่มาจาก NASA POWER ซึ่งตามหลังปัจจุบันหลายสัปดาห์
        จึงทับกับช่วงที่ระบบเก็บค่าฝุ่นได้แค่วันเดียว คำนวณความสัมพันธ์ไม่ได้
        การเก็บลมพร้อมกันในรอบเดียวกันทำให้สองชุดอยู่บนแกนเวลาเดียวกันตั้งแต่ต้น
        อีกไม่กี่สัปดาห์จะมีข้อมูลพอให้คำนวณจากของเราเองได้จริง

    ปัดเวลาลงเป็นต้นชั่วโมง เพราะต้นทางอัปเดตทุกสิบห้านาที
    ถ้าเก็บตามเวลาที่ได้มาจริงจะได้หลายแถวในชั่วโมงเดียวกันซึ่งเทียบกับค่าฝุ่นรายชั่วโมงยาก

    กลืนข้อผิดพลาดของส่วนนี้ทั้งหมด เพราะเป็นข้อมูลเสริม
    ถ้าดึงลมไม่ได้ก็ไม่ควรทำให้รอบเก็บค่าฝุ่นซึ่งเป็นงานหลักล้มไปด้วย
    """
    from app.forecast import fetch_wind_hourly_many
    from app.models import WindHourly
    from app.services import province_coordinates

    points = [
        (province, lat, lon)
        for province, (lat, lon) in sorted(province_coordinates(session).items())
    ]

    # ขอเป็นรายชั่วโมงย้อนหลัง ไม่ใช่ค่า ณ ขณะนี้
    #
    # ค่า ณ ขณะนี้เก็บได้เฉพาะชั่วโมงที่เครื่องเปิดอยู่ ถ้าปิดไปสิบชั่วโมงก็หายไปเลย
    # แต่ค่าฝุ่นจาก Air4Thai ย้อนหลังได้ วัดจริงแล้วรอบเดียวได้มาถึงสิบชั่วโมง
    # ถ้าลมเก็บได้แต่ปัจจุบัน สองชุดจะเลื่อนออกจากกันเรื่อย ๆ
    # จนคำนวณความสัมพันธ์ไม่ได้ ซึ่งเป็นเหตุผลเดียวที่สร้างตารางนี้ขึ้นมา
    rows = fetch_wind_hourly_many(points, past_days=1)
    if not rows:
        return 0

    existing = {
        (province, moment)
        for province, moment in session.exec(
            select(WindHourly.province, WindHourly.observed_at)
        ).all()
    }

    # ตัดชั่วโมงอนาคตทิ้ง ต้นทางส่งค่าพยากรณ์ของวันนี้มาด้วยเสมอ
    # ตารางนี้เก็บของที่เกิดขึ้นแล้วเท่านั้น ถ้าปนคำพยากรณ์เข้าไป
    # การเอาไปเทียบกับค่าฝุ่นที่วัดได้จริงจะกลายเป็นเทียบของจริงกับของทำนาย
    now = datetime.now().replace(minute=0, second=0, microsecond=0)

    added = 0
    for row in rows:
        try:
            moment = datetime.fromisoformat(row["observed_at"]).replace(
                minute=0, second=0, microsecond=0
            )
        except (TypeError, ValueError):
            continue
        if moment > now:
            continue
        if (row["province"], moment) in existing:
            continue
        session.add(
            WindHourly(
                province=row["province"],
                observed_at=moment,
                wind_speed=row["wind_speed"],
                wind_direction=row["wind_direction"],
                wind_gusts=row["wind_gusts"],
            )
        )
        existing.add((row["province"], moment))
        added += 1

    if added:
        session.commit()
    return added


def collect_once() -> int:
    """เก็บข้อมูลหนึ่งรอบ คืนจำนวนค่าตรวจวัดที่บันทึกใหม่

    นำเข้าตรงนี้แทนที่จะไว้บนสุดของไฟล์ เพื่อตัดวงจรการอ้างถึงกันไปมา
    """
    from app.air4thai import collect

    with Session(engine) as session:
        log = collect(session)

        try:
            winds = record_wind(session)
        except Exception:
            logger.warning("บันทึกลมรายชั่วโมงไม่สำเร็จ ข้ามรอบนี้", exc_info=True)
        else:
            if winds:
                logger.info("บันทึกลมรายชั่วโมงเพิ่ม %s จังหวัด", winds)

        return log.records_new


async def run_forever() -> None:
    """วนเก็บข้อมูลทุกชั่วโมงจนกว่าเซิร์ฟเวอร์จะปิด

    เรียก collect ผ่าน to_thread เพราะเป็นงานที่บล็อกทั้งการเรียกเครือข่าย
    และการเขียนฐานข้อมูล ถ้าเรียกตรง ๆ จะหยุดการตอบ request ของทั้งเซิร์ฟเวอร์
    ระหว่างที่กำลังเก็บ

    กลืนข้อผิดพลาดทั้งหมดโดยตั้งใจ เพราะการเก็บพลาดหนึ่งรอบไม่ควรทำให้
    ตัวเก็บหยุดถาวร ต้นทางล่มชั่วคราวเป็นเรื่องที่เกิดขึ้นได้เป็นปกติ
    """
    while True:
        await asyncio.sleep(seconds_until_next_run())

        try:
            added = await asyncio.to_thread(collect_once)
        except Exception:
            logger.warning("เก็บข้อมูลอัตโนมัติไม่สำเร็จ จะลองใหม่", exc_info=True)
            await asyncio.sleep(RETRY_SECONDS)
            continue

        if added:
            logger.info("เก็บข้อมูลอัตโนมัติได้ค่าใหม่ %s รายการ", added)
        else:
            logger.info("เก็บข้อมูลอัตโนมัติแล้ว ต้นทางยังไม่มีค่าใหม่")


def start(task_holder: list[asyncio.Task]) -> None:
    """เริ่มตัวเก็บและเก็บอ้างอิงงานไว้

    ต้องเก็บอ้างอิงไว้ เพราะ asyncio เก็บงานที่ไม่มีใครอ้างถึงทิ้งได้
    ซึ่งจะทำให้ตัวเก็บหายไปเงียบ ๆ โดยไม่มีข้อผิดพลาดใด ๆ
    """
    task_holder.append(asyncio.create_task(run_forever()))
    logger.info("เริ่มตัวเก็บข้อมูลอัตโนมัติ รอบถัดไปอีก %.0f วินาที", seconds_until_next_run())


async def stop(task_holder: list[asyncio.Task]) -> None:
    """สั่งหยุดและรอให้จบจริงก่อนปิดเซิร์ฟเวอร์"""
    for task in task_holder:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    task_holder.clear()
