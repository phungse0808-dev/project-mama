"""ฝนที่วัดได้จริงจากสถานีวัดฝนทั่วประเทศ ผ่านคลังข้อมูลน้ำแห่งชาติ (ThaiWater)

ทำไมต้องมีแหล่งนี้
    คำบอกสภาพอากาศตอนนี้จาก Open-Meteo เป็นค่าที่แบบจำลองคำนวณ ไม่ใช่ค่าที่วัดได้
    ฝนหน้าฝนตกเป็นหย่อม ๆ แบบจำลองจับได้ไม่ดี จึงเกิดกรณีที่ฝนตกอยู่จริง
    แต่หน้าเว็บบอกว่ามีเมฆเป็นส่วนมาก

    ThaiWater รวมค่าจากเครื่องวัดฝนอัตโนมัติของหลายหน่วยงาน ราวสี่พันห้าร้อยสถานี
    ครบทุกจังหวัด อัปเดตเป็นรายชั่วโมง ใช้ได้โดยไม่ต้องสมัครหรือใช้คีย์

ทำไมไม่ใช้ของกรมอุตุนิยมวิทยา
    API ของกรมอุตุฯ ให้ค่าฝนทุกสามชั่วโมงจาก 128 สถานี และนนทบุรีไม่มีสถานีเลย
    ส่วนเรดาร์มีให้เป็นรูปภาพเท่านั้น ไม่มีตัวเลขให้เอาไปใช้

ข้อจำกัดที่ต้องรู้
    ค่าออกเป็นชั่วโมงเต็ม ถ้าฝนเริ่มตกหลังต้นชั่วโมง ต้องรอถึงชั่วโมงถัดไปถึงจะเห็น
    และบอกได้เฉพาะจุดที่มีเครื่องวัด ฝนที่ตกห่างจากเครื่องวัดจะไม่ถูกนับ

คืน None เมื่อเรียกไม่สำเร็จ เพราะเป็นส่วนเสริม ถ้าต้นทางล่มต้องไม่ทำให้การ์ดอากาศหายไปทั้งใบ
"""

import math
import time
from datetime import datetime, timedelta

import requests

from app.config import CA_BUNDLE, REQUEST_TIMEOUT

RAIN_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h"
SOURCE_TH = "สถานีวัดฝนในคลังข้อมูลน้ำแห่งชาติ (ThaiWater) โดย สสน."

# รัศมีที่นับสถานีรอบจุดกลางของจังหวัด
#
# ใช้ 10 กิโลเมตร ไม่ใช่ 15 เพราะที่ 15 จุดกลางนนทบุรีเริ่มกินเข้าไปถึงกรุงเทพฯ ชั้นใน
# วันที่ 14 ก.ย. 2569 เวลา 14:00 ฝนตกที่ราชเทวีกับคลองเตย ถ้าใช้ 15 กิโลเมตร
# การ์ดของนนทบุรีจะบอกว่ามีฝนตก ทั้งที่ทั้ง 15 สถานีในรัศมี 10 กิโลเมตรวัดได้ศูนย์
RADIUS_KM = 10.0

# ต้นทางออกข้อมูลรายชั่วโมง ถามถี่กว่านี้ได้แค่ค่าเดิม
# แต่ไฟล์ทั้งประเทศใหญ่ราวสี่เมกะไบต์ครึ่ง จึงเก็บไว้ใช้ซ้ำทุกจังหวัด
CACHE_SECONDS = 600

# สถานีที่ส่งค่าช้ากว่าชั่วโมงล่าสุดเกินนี้ ไม่นับ
# เพราะเป็นฝนของช่วงเวลาอื่น เอามารวมจะบอกว่ามีฝนตอนนี้ทั้งที่เป็นฝนเมื่อหลายชั่วโมงก่อน
MAX_LAG_MINUTES = 60

_cache: tuple[float, list[dict]] | None = None


def _number(value: object) -> float | None:
    try:
        return None if value is None or value == "" else float(value)
    except (TypeError, ValueError):
        return None


def fetch_stations() -> list[dict] | None:
    """ค่าฝนล่าสุดของทุกสถานี เก็บเฉพาะช่องที่ต้องใช้"""
    global _cache
    if _cache and time.time() - _cache[0] < CACHE_SECONDS:
        return _cache[1]

    try:
        response = requests.get(RAIN_URL, timeout=REQUEST_TIMEOUT, verify=CA_BUNDLE)
        response.raise_for_status()
        rows = response.json().get("data") or []
    except (requests.RequestException, ValueError, AttributeError):
        return None

    stations = []
    for row in rows:
        station = row.get("station") or {}
        geocode = row.get("geocode") or {}
        lat = _number(station.get("tele_station_lat"))
        lon = _number(station.get("tele_station_long"))
        rain_1h = _number(row.get("rain_1h"))
        try:
            measured_at = datetime.strptime(row.get("rainfall_datetime") or "", "%Y-%m-%d %H:%M")
        except ValueError:
            continue
        if lat is None or lon is None or rain_1h is None:
            continue
        stations.append(
            {
                "name": ((station.get("tele_station_name") or {}).get("th") or "").strip(),
                "amphoe": ((geocode.get("amphoe_name") or {}).get("th") or "").strip(),
                "latitude": lat,
                "longitude": lon,
                "rain_1h": rain_1h,
                "measured_at": measured_at,
            }
        )

    _cache = (time.time(), stations)
    return stations


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """ระยะทางบนผิวโลกระหว่างสองพิกัด"""
    radius = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def rain_near(latitude: float, longitude: float, radius_km: float = RADIUS_KM) -> dict | None:
    """สรุปฝนชั่วโมงล่าสุดจากสถานีวัดฝนในรัศมีที่กำหนด

    คืน None เมื่อเรียกต้นทางไม่สำเร็จ
    คืน stations เป็นศูนย์เมื่อไม่มีสถานีในรัศมี ให้หน้าเว็บบอกตรง ๆ ว่าไม่มีเครื่องวัดแถวนั้น
    """
    stations = fetch_stations()
    if stations is None:
        return None

    nearby = [
        s for s in stations
        if distance_km(latitude, longitude, s["latitude"], s["longitude"]) <= radius_km
    ]
    if not nearby:
        return {"radius_km": radius_km, "stations": 0, "raining": 0, "source": SOURCE_TH}

    latest = max(s["measured_at"] for s in nearby)
    fresh = [s for s in nearby if latest - s["measured_at"] <= timedelta(minutes=MAX_LAG_MINUTES)]
    wet = sorted((s for s in fresh if s["rain_1h"] > 0), key=lambda s: s["rain_1h"], reverse=True)
    top = wet[0] if wet else None

    return {
        "radius_km": radius_km,
        "hour_start": (latest - timedelta(hours=1)).strftime("%H:%M"),
        "hour_end": latest.strftime("%H:%M"),
        "measured_at": latest.isoformat(),
        "stations": len(fresh),
        "raining": len(wet),
        "max_mm": top["rain_1h"] if top else 0,
        "max_station": top["name"] if top else None,
        "max_amphoe": top["amphoe"] if top else None,
        "source": SOURCE_TH,
    }
