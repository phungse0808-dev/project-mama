"""REST API ของระบบเฝ้าระวังคุณภาพอากาศ

รันด้วย:  uvicorn app.main:app --reload
เอกสาร API อัตโนมัติ: http://127.0.0.1:8000/docs
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlmodel import Session, col, desc, func, select

from app.config import CORS_ORIGINS
from app.db import create_db_and_tables, get_session
from app.health_advice import RISK_GROUPS
from app.models import Station
from app.services import (
    alerts,
    all_stations_latest,
    collection_health,
    health_guidance,
    hiv_statistics,
    national_summary,
    personal_summary,
    province_ranking,
    sign_in,
    station_daily,
    station_history,
    update_profile,
    vulnerability_index,
    weather_history,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    create_db_and_tables()
    yield


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
def mount_frontend() -> None:
    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if not (dist / "index.html").exists():
        return  # ยังไม่ได้ build หน้าเว็บ ใช้เฉพาะ API ได้ตามปกติ
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")


@app.get("/api/summary", tags=["แดชบอร์ด"])
def get_summary(session: Session = Depends(get_session)) -> dict:
    """ภาพรวมคุณภาพอากาศทั้งประเทศ ณ ชั่วโมงล่าสุด"""
    return national_summary(session)


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


@app.get("/api/hiv", tags=["พื้นที่เปราะบาง"])
def get_hiv_statistics(session: Session = Depends(get_session)) -> dict:
    """สถิติผู้ติดเชื้อเอชไอวีรายจังหวัด ปีล่าสุดที่นำเข้าไว้

    เป็นข้อมูลรวมยอดระดับจังหวัดที่หน่วยงานรัฐเผยแพร่เป็นสาธารณะเท่านั้น
    ระบบไม่เก็บและไม่แสดงข้อมูลรายบุคคลหรือข้อมูลที่ละเอียดกว่าระดับจังหวัด
    """
    return hiv_statistics(session)


@app.get("/api/vulnerability", tags=["พื้นที่เปราะบาง"])
def get_vulnerability(session: Session = Depends(get_session)) -> dict:
    """ลำดับจังหวัดที่ควรเฝ้าระวังคุณภาพอากาศก่อน

    รวมค่าฝุ่นปัจจุบันเข้ากับสัดส่วนประชากรที่มีภูมิคุ้มกันบกพร่องในพื้นที่
    """
    return vulnerability_index(session)


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
