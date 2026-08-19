"""สภาพอากาศปัจจุบันและพยากรณ์วันนี้ จาก Open-Meteo

ทำไมต้องมีแหล่งที่สอง
    NASA POWER ซึ่งระบบใช้เก็บข้อมูลย้อนหลัง เผยแพร่เฉพาะข้อมูลที่ผ่านมาแล้ว
    และตามหลังปัจจุบันอยู่ราวสามถึงห้าวันเสมอ จึงบอกสภาพอากาศ ณ ขณะนี้ไม่ได้เลย
    ไม่ว่าจะแก้โค้ดอย่างไร

    Open-Meteo ให้ค่าปัจจุบันที่อัปเดตทุก 15 นาที และพยากรณ์ของวันนี้
    ใช้ฟรี ไม่ต้องสมัคร ไม่ต้องใช้คีย์

แบ่งหน้าที่กันชัดเจน
    NASA POWER   ข้อมูลย้อนหลังถึงปี 2563 ใช้วิเคราะห์ในงานวิจัย
    Open-Meteo   สภาพอากาศตอนนี้และพยากรณ์วันนี้ ใช้แสดงบนหน้าเว็บ

    ไม่เอาสองแหล่งมาปนกันในการวิเคราะห์ เพราะวิธีวัดและความละเอียดต่างกัน
    ถ้าเอามาต่อกันเป็นอนุกรมเวลาเดียวจะเกิดรอยต่อที่อธิบายไม่ได้
"""

import time
from datetime import datetime

import requests

from app.config import CA_BUNDLE, REQUEST_TIMEOUT

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE = "Open-Meteo (open-meteo.com)"

# เก็บผลไว้ใช้ซ้ำ 10 นาที
#
# ต้นทางอัปเดตทุก 15 นาที การถามถี่กว่านั้นจึงไม่ได้ค่าใหม่
# แต่ทำให้หน้าเว็บช้าลงและเปลืองโควตาของผู้ให้บริการโดยเปล่าประโยชน์
CACHE_SECONDS = 600

_cache: dict[tuple[float, float], tuple[float, dict]] = {}

# รหัสสภาพอากาศตามมาตรฐาน WMO แปลเป็นคำอธิบายภาษาไทย
# ต้นทางส่งมาเป็นตัวเลข ถ้าไม่แปลผู้ใช้จะเห็นแค่เลขที่ไม่มีความหมาย
WEATHER_CODES: dict[int, str] = {
    0: "ท้องฟ้าแจ่มใส",
    1: "มีเมฆบางส่วน",
    2: "มีเมฆเป็นส่วนมาก",
    3: "เมฆครึ้ม",
    45: "มีหมอก",
    48: "หมอกน้ำค้างแข็ง",
    51: "ฝนละอองเบา",
    53: "ฝนละออง",
    55: "ฝนละอองหนา",
    56: "ฝนละอองเยือกแข็ง",
    57: "ฝนละอองเยือกแข็งหนา",
    61: "ฝนเล็กน้อย",
    63: "ฝนปานกลาง",
    65: "ฝนหนัก",
    66: "ฝนเยือกแข็ง",
    67: "ฝนเยือกแข็งหนัก",
    71: "หิมะเล็กน้อย",
    73: "หิมะปานกลาง",
    75: "หิมะหนัก",
    77: "เม็ดหิมะ",
    80: "ฝนซู่เล็กน้อย",
    81: "ฝนซู่ปานกลาง",
    82: "ฝนซู่หนัก",
    85: "หิมะซู่เล็กน้อย",
    86: "หิมะซู่หนัก",
    95: "พายุฝนฟ้าคะนอง",
    96: "พายุฝนฟ้าคะนองมีลูกเห็บ",
    99: "พายุฝนฟ้าคะนองมีลูกเห็บหนัก",
}


def describe_code(code: int | None) -> str:
    """แปลรหัสสภาพอากาศเป็นคำอธิบาย คืนข้อความกลางถ้าไม่รู้จักรหัส"""
    if code is None:
        return "ไม่ทราบสภาพอากาศ"
    return WEATHER_CODES.get(int(code), f"รหัสสภาพอากาศ {int(code)}")


def fetch_now(latitude: float, longitude: float) -> dict | None:
    """สภาพอากาศปัจจุบันและพยากรณ์วันนี้ของพิกัดหนึ่งจุด

    คืน None เมื่อเรียกไม่สำเร็จ ให้ผู้เรียกตัดสินใจเองว่าจะแสดงอะไรแทน
    ไม่โยนข้อผิดพลาดต่อ เพราะข้อมูลส่วนนี้เป็นส่วนเสริม
    ถ้าล่มไม่ควรทำให้ทั้งหน้าเว็บใช้ไม่ได้
    """
    key = (round(latitude, 2), round(longitude, 2))
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
                "daily": "precipitation_probability_max,temperature_2m_max,temperature_2m_min,precipitation_sum",
                "forecast_days": 1,
                "timezone": "Asia/Bangkok",
            },
            timeout=REQUEST_TIMEOUT,
            verify=CA_BUNDLE,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    current = payload.get("current") or {}
    daily = payload.get("daily") or {}

    def first(name: str):
        values = daily.get(name)
        return values[0] if isinstance(values, list) and values else None

    observed = current.get("time")
    result = {
        "source": SOURCE,
        "observed_at": observed,
        # ต้นทางส่งเวลาไทยมาแล้ว เพราะขอไว้ด้วย timezone=Asia/Bangkok
        "minutes_behind": _minutes_since(observed),
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "precipitation": current.get("precipitation"),
        "wind_speed": current.get("wind_speed_10m"),
        "weather_code": current.get("weather_code"),
        "condition": describe_code(current.get("weather_code")),
        "rain_chance_pct": first("precipitation_probability_max"),
        "temp_max": first("temperature_2m_max"),
        "temp_min": first("temperature_2m_min"),
        "rain_today_mm": first("precipitation_sum"),
    }

    _cache[key] = (time.time(), result)
    return result


def _minutes_since(observed: str | None) -> int | None:
    """ค่าที่ได้เก่าไปกี่นาทีแล้ว ใช้บอกผู้ใช้ว่าข้อมูลสดแค่ไหน"""
    if not observed:
        return None
    try:
        moment = datetime.fromisoformat(observed)
    except ValueError:
        return None
    return max(0, int((datetime.now() - moment).total_seconds() // 60))
