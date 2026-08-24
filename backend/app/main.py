"""REST API ของระบบเฝ้าระวังคุณภาพอากาศ

รันด้วย:  uvicorn app.main:app --reload
เอกสาร API อัตโนมัติ: http://127.0.0.1:8000/docs
"""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlmodel import Session, col, desc, func, select

from app import collector
from app.config import CORS_ORIGINS
from app.db import create_db_and_tables, get_session
from app.health_advice import RISK_GROUPS
from app.live import refresh_if_stale
from app.models import Station
from app.services import (
    alerts,
    all_stations_latest,
    collection_health,
    disease_summary,
    forecast_accuracy,
    health_guidance,
    national_summary,
    personal_summary,
    pm25_forecast,
    province_ranking,
    rain_chance,
    sign_in,
    station_daily,
    station_history,
    update_profile,
    weather_history,
    weather_now,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    """เตรียมฐานข้อมูลและเริ่มตัวเก็บข้อมูลอัตโนมัติตอนเซิร์ฟเวอร์ขึ้น

    ตัวเก็บทำงานทุกชั่วโมงตราบใดที่เซิร์ฟเวอร์เปิดอยู่ ทำให้ข้อมูลใหม่
    เข้าฐานข้อมูลเองโดยไม่ต้องรอให้ใครสั่งนำเข้าหรือเปิดหน้าเว็บ
    ค่าที่คำนวณต่อจากข้อมูล เช่น ค่าชดเชยของแบบจำลอง จึงเป็นค่าล่าสุดเสมอ
    """
    create_db_and_tables()
    background: list[asyncio.Task] = []
    collector.start(background)
    try:
        yield
    finally:
        await collector.stop(background)


app = FastAPI(
    title="ระบบเฝ้าระวังคุณภาพอากาศ PM2.5",
    description="API สำหรับแดชบอร์ดเฝ้าระวังฝุ่นละออง ข้อมูลจริงจาก Air4Thai และ NASA POWER",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["ระบบ"])
def health() -> dict:
    return {"status": "ok"}


# เสิร์ฟหน้าเว็บที่ build แล้วจากเซิร์ฟเวอร์ตัวเดียวกับ API
#
# ทำแบบนี้เพื่อให้เปิดใช้งานจริงต้องรันโปรแกรมแค่ตัวเดียว ไม่ต้องเปิดสองหน้าต่าง
# และไม่ติดปัญหา CORS เพราะหน้าเว็บกับ API อยู่ที่อยู่เดียวกัน
#
# ต้องประกาศไว้ท้ายไฟล์ หลังทุก route ของ API เพราะ mount ที่ "/" จะรับทุกเส้นทาง
# ที่ไม่ตรงกับ route ใดเลย ถ้าประกาศก่อน API จะถูกกลืนหมด
class FrontendFiles(StaticFiles):
    """เสิร์ฟไฟล์หน้าเว็บ โดยห้ามเบราว์เซอร์เก็บ index.html ไว้ใช้ซ้ำ

    ทำไมต้องแยกกฎให้ index.html
        ไฟล์ js กับ css ที่ build ออกมามีรหัสของเนื้อหาอยู่ในชื่อไฟล์
        พอแก้โค้ดแล้ว build ใหม่ ชื่อไฟล์จะเปลี่ยนตาม เก็บไว้ในเครื่องนานแค่ไหนก็ได้
        เพราะชื่อเดิมย่อมหมายถึงเนื้อหาเดิมเสมอ

        แต่ index.html ชื่อคงที่ตลอด และเป็นที่เดียวที่บอกว่าต้องโหลดไฟล์ชื่ออะไร
        ถ้าเบราว์เซอร์เก็บไว้ใช้ซ้ำ มันจะไปโหลดไฟล์ชื่อเก่าต่อไปเรื่อย ๆ
        ผู้ใช้จึงเห็นเว็บรุ่นเก่าทั้งที่อัปเดตไปแล้ว และไม่มีทางรู้ตัวเลย
        ต้องกดล้างแคชเองถึงจะเห็นของใหม่ ซึ่งไม่ควรต้องให้ใครทำ

    no-cache ไม่ได้แปลว่าห้ามเก็บ แต่แปลว่าเก็บได้และต้องถามก่อนใช้ทุกครั้ง
    ถ้าไฟล์ไม่เปลี่ยน เซิร์ฟเวอร์ตอบสั้น ๆ ว่าใช้ของเดิมได้ จึงแทบไม่เปลืองอะไร
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        if response.media_type == "text/html":
            response.headers["cache-control"] = "no-cache"
        return response


def mount_frontend() -> None:
    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if not (dist / "index.html").exists():
        return  # ยังไม่ได้ build หน้าเว็บ ใช้เฉพาะ API ได้ตามปกติ
    app.mount("/", FrontendFiles(directory=dist, html=True), name="frontend")


@app.get("/api/summary", tags=["แดชบอร์ด"])
def get_summary(
    province: str | None = None,
    session: Session = Depends(get_session),
) -> dict:
    """ภาพรวมคุณภาพอากาศ ณ ชั่วโมงล่าสุด

    ไม่ส่ง province มาแปลว่าทั้งประเทศ ส่งมาจะนับเฉพาะสถานีในจังหวัดนั้น

    ถ้าข้อมูลในฐานข้อมูลเก่าเกินกำหนด จะไปดึงจาก Air4Thai ให้ก่อนหนึ่งครั้ง
    ผู้ใช้จึงไม่ต้องสั่งนำเข้าข้อมูลเองเพื่อให้หน้าเว็บเป็นปัจจุบัน
    """
    refresh_if_stale(session)
    return national_summary(session, province)


@app.get("/api/stations", tags=["แดชบอร์ด"])
def get_stations(
    include_stale: bool = Query(False, description="รวมสถานีที่ข้อมูลค้างเก่าด้วยหรือไม่"),
    session: Session = Depends(get_session),
) -> list[dict]:
    """ค่าล่าสุดของทุกสถานี สำหรับปักหมุดบนแผนที่"""
    return all_stations_latest(session, include_stale)


@app.get("/api/provinces/ranking", tags=["แดชบอร์ด"])
def get_province_ranking(session: Session = Depends(get_session)) -> list[dict]:
    """อันดับจังหวัดตามค่า PM2.5 เฉลี่ย"""
    return province_ranking(session)


@app.get("/api/stations/{station_code}/history", tags=["แดชบอร์ด"])
def get_station_history(
    station_code: str,
    hours: int = Query(48, ge=1, le=720),
    session: Session = Depends(get_session),
) -> dict:
    """ประวัติค่าตรวจวัดย้อนหลังของหนึ่งสถานี"""
    result = station_history(session, station_code, hours)
    if not result:
        raise HTTPException(status_code=404, detail=f"ไม่พบสถานีรหัส {station_code}")
    return result


@app.get("/api/stations/{station_code}/daily", tags=["แดชบอร์ด"])
def get_station_daily(
    station_code: str,
    days: int = Query(30, ge=1, le=730),
    session: Session = Depends(get_session),
) -> dict:
    """ค่าเฉลี่ยรายวันของสถานี สำหรับเทียบกับมาตรฐาน 24 ชั่วโมงของประเทศไทย"""
    result = station_daily(session, station_code, days)
    if not result:
        raise HTTPException(status_code=404, detail=f"ไม่พบสถานีรหัส {station_code}")
    return result


@app.get("/api/provinces", tags=["ข้อมูลพื้นฐาน"])
def get_provinces(session: Session = Depends(get_session)) -> list[str]:
    """รายชื่อจังหวัดที่มีสถานีตรวจวัด"""
    rows = session.exec(
        select(Station.province).group_by(Station.province).order_by(col(Station.province))
    ).all()
    return list(rows)


@app.get("/api/weather/{province}", tags=["ข้อมูลอากาศ"])
def get_weather(
    province: str,
    days: int = Query(30, ge=1, le=3650),
    session: Session = Depends(get_session),
) -> dict:
    """ข้อมูลอากาศรายวันย้อนหลังของหนึ่งจังหวัด"""
    result = weather_history(session, province, days)
    if not result["points"]:
        raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลอากาศของจังหวัด {province}")
    return result


class SignInRequest(BaseModel):
    """ข้อมูลที่ใช้เข้าระบบ มีแค่ชื่อ ไม่มีรหัสผ่าน"""

    name: str = Field(min_length=1, max_length=60, description="ชื่อที่ใช้แสดงในระบบ")


class ProfileRequest(BaseModel):
    """ค่าที่ผู้ใช้ตั้งเองเพื่อให้คำแนะนำตรงกับตัวเอง"""

    province: str | None = Field(default=None, max_length=60)
    risk_group: str | None = Field(default=None, max_length=40)


@app.get("/api/forecast-accuracy/{province}", tags=["ข้อมูลอากาศ"])
def get_forecast_accuracy(
    province: str,
    station: str | None = Query(None, description="รหัสสถานี ถ้าไม่ระบุจะเฉลี่ยทั้งจังหวัด"),
    session: Session = Depends(get_session),
) -> dict:
    """ความแม่นยำของแบบจำลองพยากรณ์ เทียบกับค่าที่สถานีตรวจวัดของระบบวัดได้จริง

    เป็นการตรวจสอบว่าแบบจำลองบรรยากาศระดับโลกใช้กับพื้นที่ไทยได้ดีเพียงใด
    ซึ่งทำได้เพราะระบบเก็บค่าที่วัดได้จริงรายชั่วโมงไว้เอง

    ดึงค่าฝุ่นล่าสุดเข้าฐานข้อมูลก่อนคำนวณเสมอ เพราะความคลาดเคลื่อนคิดจาก
    ค่าที่วัดได้จริง ถ้าฐานข้อมูลค้างอยู่ที่ชั่วโมงเก่า ค่าที่ได้จะไม่สะท้อนของล่าสุด
    """
    refresh_if_stale(session)
    return forecast_accuracy(session, province, station)


@app.get("/api/pm25-forecast/{province}", tags=["ข้อมูลอากาศ"])
def get_pm25_forecast(
    province: str,
    station: str | None = Query(None, description="รหัสสถานี ถ้าไม่ระบุจะเฉลี่ยทั้งจังหวัด"),
    session: Session = Depends(get_session),
) -> dict:
    """ค่าฝุ่นที่คาดว่าจะเกิดขึ้นล่วงหน้าสามวัน สรุปเป็นรายวัน

    ค่าตั้งต้นมาจากแบบจำลองบรรยากาศภายนอก แล้วชดเชยด้วยค่าคลาดเคลื่อน
    ที่คำนวณจากค่าที่สถานีในจังหวัดนั้นวัดได้จริง

    ดึงค่าฝุ่นล่าสุดเข้าฐานข้อมูลก่อนคำนวณเสมอ เพราะค่าชดเชยคิดจากค่าที่วัดได้จริง
    ทุกชั่วโมงที่เก็บเพิ่มได้จะทำให้ค่าชดเชยแม่นขึ้น จึงต้องคิดใหม่ทุกครั้ง
    ไม่ใช่คิดครั้งเดียวแล้วใช้ค่าเดิมตลอด
    """
    refresh_if_stale(session)
    return pm25_forecast(session, province, station_code=station)


@app.get("/api/weather-now/{province}", tags=["ข้อมูลอากาศ"])
def get_weather_now(province: str, session: Session = Depends(get_session)) -> dict:
    """สภาพอากาศ ณ ขณะนี้ และพยากรณ์โอกาสฝนตกของวันนี้

    ใช้แหล่งข้อมูลคนละตัวกับข้อมูลย้อนหลังที่ระบบเก็บเอง
    เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลที่ผ่านมาแล้วและตามหลังหลายวัน
    จึงบอกสภาพอากาศปัจจุบันไม่ได้
    """
    return weather_now(session, province)


@app.get("/api/rain-chance/{province}", tags=["ข้อมูลอากาศ"])
def get_rain_chance(province: str, session: Session = Depends(get_session)) -> dict:
    """โอกาสฝนตกของวันนี้ คิดจากสถิติย้อนหลังของช่วงวันเดียวกันในปีก่อนๆ

    ไม่ใช่การพยากรณ์อากาศ เพราะไม่ได้ดูสภาพบรรยากาศจริงในขณะนี้
    เป็นความถี่ที่เคยเกิดขึ้นในอดีต ซึ่งเรียกว่าความน่าจะเป็นเชิงภูมิอากาศ
    """
    return rain_chance(session, province)


@app.post("/api/users/sign-in", tags=["ผู้ใช้งาน"])
def post_sign_in(payload: SignInRequest, session: Session = Depends(get_session)) -> dict:
    """เข้าใช้งานด้วยชื่อ ถ้าเป็นชื่อใหม่ระบบจะสร้างผู้ใช้ให้

    ไม่มีรหัสผ่านและไม่มี token โดยเจตนา ระบบนี้ระบุตัวตนเพื่อจำค่าที่ผู้ใช้ตั้งไว้
    ไม่ได้ใช้ควบคุมสิทธิ์การเข้าถึงข้อมูล
    """
    user = sign_in(session, payload.name)
    if user is None:
        raise HTTPException(status_code=400, detail="กรุณากรอกชื่อ")
    return {
        "id": user.id,
        "display_name": user.display_name,
        "province": user.province,
        "risk_group": user.risk_group,
    }


@app.patch("/api/users/{user_id}", tags=["ผู้ใช้งาน"])
def patch_profile(
    user_id: int,
    payload: ProfileRequest,
    session: Session = Depends(get_session),
) -> dict:
    """ตั้งจังหวัดและกลุ่มเสี่ยงของผู้ใช้"""
    try:
        user = update_profile(session, user_id, payload.province, payload.risk_group)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if user is None:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")
    return {
        "id": user.id,
        "display_name": user.display_name,
        "province": user.province,
        "risk_group": user.risk_group,
    }


@app.get("/api/users/{user_id}/summary", tags=["ผู้ใช้งาน"])
def get_personal_summary(user_id: int, session: Session = Depends(get_session)) -> dict:
    """สถานการณ์และคำแนะนำเฉพาะตัวของผู้ใช้"""
    result = personal_summary(session, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="ไม่พบผู้ใช้")
    return result


@app.get("/api/risk-groups", tags=["ข้อมูลพื้นฐาน"])
def get_risk_groups() -> list[dict]:
    """รายชื่อกลุ่มเสี่ยงให้ผู้ใช้เลือก"""
    return [
        {
            "key": group.key,
            "label_th": group.label_th,
            "detail_th": group.detail_th,
            "sensitive": group.sensitive,
        }
        for group in RISK_GROUPS
    ]


@app.get("/api/health-advice", tags=["สุขภาพ"])
def get_health_advice(
    province: str | None = Query(None, description="เว้นว่างเพื่อดูภาพรวมทั้งประเทศ"),
    session: Session = Depends(get_session),
) -> dict:
    """คำแนะนำสุขภาพของทุกกลุ่มเสี่ยง ตามค่าฝุ่นของพื้นที่ที่เลือก"""
    return health_guidance(session, province)


@app.get("/api/alerts", tags=["สุขภาพ"])
def get_alerts(session: Session = Depends(get_session)) -> dict:
    """พื้นที่ที่ค่าฝุ่นเกินมาตรฐานไทยหรือเกินค่าแนะนำขององค์การอนามัยโลก"""
    return alerts(session)


@app.get("/api/disease", tags=["ผลกระทบสุขภาพ"])
def get_disease_summary(session: Session = Depends(get_session)) -> dict:
    """จำนวนผู้ป่วยกลุ่มโรคที่เกี่ยวข้องกับฝุ่น รายเดือน พร้อมสภาพอากาศเดือนเดียวกัน

    เป็นยอดรวมระดับจังหวัดเท่านั้น ต้นทางเผยแพร่เป็นข้อมูลรายบุคคล
    แต่ระบบนี้รวมยอดตั้งแต่ขั้นนำเข้าและไม่เก็บรายละเอียดบุคคลไว้เลย
    """
    return disease_summary(session)


@app.get("/api/collection/health", tags=["คุณภาพข้อมูล"])
def get_collection_health(session: Session = Depends(get_session)) -> dict:
    """สถานะและความครบถ้วนของการเก็บข้อมูล"""
    return collection_health(session)


@app.get("/api/stats", tags=["ระบบ"])
def get_stats(session: Session = Depends(get_session)) -> dict:
    """จำนวนสถานีแยกตามจังหวัด ใช้ตรวจสอบความครอบคลุมของเครือข่ายสถานี"""
    rows = session.exec(
        select(Station.province, func.count())
        .group_by(Station.province)
        .order_by(desc(func.count()))
    ).all()
    return {"provinces": [{"province": row[0], "stations": row[1]} for row in rows]}


mount_frontend()
