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

# บริการพยากรณ์ฝุ่น แยกที่อยู่จากพยากรณ์อากาศ แต่เป็นผู้ให้บริการรายเดียวกัน
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
SOURCE = "Open-Meteo (open-meteo.com)"

# เก็บผลไว้ใช้ซ้ำ 10 นาที
#
# ต้นทางอัปเดตทุก 15 นาที การถามถี่กว่านั้นจึงไม่ได้ค่าใหม่
# แต่ทำให้หน้าเว็บช้าลงและเปลืองโควตาของผู้ให้บริการโดยเปล่าประโยชน์
CACHE_SECONDS = 600

_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_pm25_cache: dict[tuple[float, float, int, int], tuple[float, list[dict]]] = {}
_wind_cache: dict[tuple[float, float, int], tuple[float, dict]] = {}

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
                "current": (
                    "temperature_2m,relative_humidity_2m,precipitation,"
                    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code"
                ),
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
        # ทิศทางเป็นองศาที่ลม "พัดมาจาก" ตามธรรมเนียมอุตุนิยมวิทยา
        # ศูนย์องศาคือลมจากทิศเหนือ เก้าสิบคือลมจากทิศตะวันออก
        "wind_direction": current.get("wind_direction_10m"),
        "wind_gusts": current.get("wind_gusts_10m"),
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


def fetch_pm25_forecast(
    latitude: float, longitude: float, days: int = 3, past_days: int = 0
) -> list[dict] | None:
    """ค่าฝุ่น PM2.5 ที่คาดว่าจะเกิดขึ้นรายชั่วโมง ล่วงหน้าตามจำนวนวันที่ขอ

    ทำไมต้องดึงจากที่อื่น ไม่คำนวณเอง
        การสร้างแบบจำลองพยากรณ์ฝุ่นต้องใช้ข้อมูลย้อนหลังอย่างน้อยหนึ่งปีเต็ม
        เพราะฝุ่นในไทยขึ้นกับฤดูกาลอย่างชัดเจน ช่วงมกราคมถึงเมษายนสูงกว่าหน้าฝนหลายเท่า
        แบบจำลองที่เรียนรู้จากข้อมูลหน้าฝนอย่างเดียวจะทำนายหน้าแล้งผิดทั้งหมด
        ระบบนี้เพิ่งเริ่มเก็บค่าฝุ่นได้ราวหนึ่งเดือน จึงยังสร้างแบบจำลองเองไม่ได้

        ค่าที่ได้มาจากแบบจำลองบรรยากาศ CAMS ของศูนย์พยากรณ์อากาศระยะปานกลางแห่งยุโรป
        ต้องระบุที่มาให้ชัดทุกครั้งที่แสดงผล ห้ามให้เข้าใจว่าระบบคำนวณเอง

    คืน None เมื่อเรียกไม่สำเร็จ เพราะเป็นส่วนเสริม ไม่ควรทำให้ทั้งหน้าใช้ไม่ได้
    """
    key = (round(latitude, 2), round(longitude, 2), days, past_days)
    cached = _pm25_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    try:
        response = requests.get(
            AIR_QUALITY_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "hourly": "pm2_5",
                "forecast_days": days,
                # ขอค่าที่แบบจำลองเคยทำนายไว้ย้อนหลังด้วย เพื่อนำมาเทียบกับ
                # ค่าที่สถานีตรวจวัดของเราวัดได้จริงในช่วงเดียวกัน
                "past_days": past_days,
                "timezone": "Asia/Bangkok",
            },
            timeout=REQUEST_TIMEOUT,
            verify=CA_BUNDLE,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return None

    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    values = hourly.get("pm2_5") or []

    # ตัดชั่วโมงที่ต้นทางไม่มีค่าออก ดีกว่าปล่อยให้ค่าว่างไปโผล่ในการคำนวณสรุป
    result = [
        {"time": t, "pm25": v}
        for t, v in zip(times, values)
        if v is not None
    ]
    if not result:
        return None

    _pm25_cache[key] = (time.time(), result)
    return result


# ระดับความแรงลมตามมาตราโบฟอร์ต ซึ่งเป็นมาตรฐานสากลขององค์การอุตุนิยมวิทยาโลก
#
# ทำไมใช้มาตรฐานสำเร็จรูป ไม่ตั้งเกณฑ์เอง
#     เหตุผลเดียวกับที่ระดับคุณภาพอากาศใช้เกณฑ์ของกรมควบคุมมลพิษ
#     ถ้าตั้งเกณฑ์เองจะต้องอธิบายให้ได้ว่าเอาตัวเลขมาจากไหน ซึ่งอธิบายไม่ได้
#
# ย่อจากสิบสามระดับเหลือห้า เพราะประเทศไทยแทบไม่เจอลมเกินระดับหก
# และห้าระดับเท่ากับจำนวนระดับคุณภาพอากาศพอดี หน้าเว็บจึงอ่านเป็นภาษาเดียวกัน
# ขอบเขตยังเป็นของโบฟอร์ตทุกตัว ไม่ได้ขยับ
WIND_LEVELS: list[dict] = [
    {"key": "calm", "label_th": "ลมสงบ", "upper_kmh": 1.0},
    {"key": "light_air", "label_th": "ลมเบา", "upper_kmh": 5.0},
    {"key": "light_breeze", "label_th": "ลมอ่อน", "upper_kmh": 11.0},
    {"key": "gentle_breeze", "label_th": "ลมโชย", "upper_kmh": 19.0},
    {"key": "moderate", "label_th": "ลมปานกลางขึ้นไป", "upper_kmh": None},
]

# ลมที่ต่ำกว่านี้ถือว่าอากาศแทบไม่ถ่ายเท
#
# ตรงกับขอบบนของระดับลมเบาในมาตราโบฟอร์ต ไม่ใช่ตัวเลขที่ตั้งขึ้นเอง
# ใช้เป็นเส้นบอกช่วงเวลาที่ฝุ่นมีแนวโน้มสะสม ไม่ใช่คำทำนายว่าฝุ่นจะสูงเท่าไร
CALM_THRESHOLD_KMH = 5.0

# ทิศทางลมสิบหกทิศ แปลงจากองศาเป็นชื่อที่คนอ่านรู้เรื่อง
_COMPASS = [
    "เหนือ", "เหนือค่อนตะวันออก", "ตะวันออกเฉียงเหนือ", "ตะวันออกค่อนเหนือ",
    "ตะวันออก", "ตะวันออกค่อนใต้", "ตะวันออกเฉียงใต้", "ใต้ค่อนตะวันออก",
    "ใต้", "ใต้ค่อนตะวันตก", "ตะวันตกเฉียงใต้", "ตะวันตกค่อนใต้",
    "ตะวันตก", "ตะวันตกค่อนเหนือ", "ตะวันตกเฉียงเหนือ", "เหนือค่อนตะวันตก",
]


def describe_direction(degrees: float | None) -> str | None:
    """แปลงองศาเป็นชื่อทิศที่ลมพัดมาจาก คืน None เมื่อไม่มีค่า"""
    if degrees is None:
        return None
    # บวกครึ่งช่วงก่อนหาร เพื่อให้ปัดเข้าทิศที่ใกล้ที่สุด ไม่ใช่ปัดลงเสมอ
    return _COMPASS[int((float(degrees) + 11.25) % 360 // 22.5)]


def describe_wind_level(speed_kmh: float | None) -> dict | None:
    """ระดับความแรงลมตามมาตราโบฟอร์ต คืน None เมื่อไม่มีค่า"""
    if speed_kmh is None:
        return None
    for level in WIND_LEVELS:
        upper = level["upper_kmh"]
        if upper is None or speed_kmh < upper:
            return {"key": level["key"], "label_th": level["label_th"]}
    return None


def fetch_wind(latitude: float, longitude: float, hours: int = 24) -> dict | None:
    """ลมปัจจุบันและลมรายชั่วโมงข้างหน้าของพิกัดหนึ่งจุด

    ทำไมต้องเป็นค่าปัจจุบันกับพยากรณ์ ไม่ใช่ค่าย้อนหลัง
        ข้อมูลลมย้อนหลังที่ระบบเก็บไว้มาจาก NASA POWER ซึ่งตามหลังปัจจุบันหลายสัปดาห์
        พอเอาไปเทียบกับค่าฝุ่นที่เพิ่งเริ่มเก็บกลางเดือนสิงหาคม สองชุดทับกันแค่วันเดียว
        จึงคำนวณความสัมพันธ์ระหว่างลมกับฝุ่นจากข้อมูลของระบบเองไม่ได้เลยในตอนนี้
        แผงนี้จึงตอบว่าลมตอนนี้เป็นอย่างไรและอีกยี่สิบสี่ชั่วโมงจะเป็นอย่างไร
        ซึ่งเป็นคำถามที่ตอบได้จริงจากข้อมูลที่มี

    คืน None เมื่อเรียกไม่สำเร็จ เพราะเป็นส่วนเสริมเหมือนพยากรณ์อื่น ๆ
    """
    key = (round(latitude, 2), round(longitude, 2), hours)
    cached = _wind_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                "hourly": "wind_speed_10m,wind_direction_10m",
                # ขอสองวันเพราะยี่สิบสี่ชั่วโมงข้างหน้าคร่อมเที่ยงคืนเสมอ
                # ถ้าขอวันเดียวจะได้ไม่ครบเมื่อเรียกตอนบ่ายหรือเย็น
                "forecast_days": 2,
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
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    speeds = hourly.get("wind_speed_10m") or []
    directions = hourly.get("wind_direction_10m") or []

    # ตัดชั่วโมงที่ผ่านไปแล้วออก ต้นทางส่งมาตั้งแต่เที่ยงคืนของวันนี้เสมอ
    # ถ้าไม่ตัด ผู้ใช้ที่เปิดตอนบ่ายจะเห็นลมของเมื่อเช้าปนอยู่ในคำว่า "ข้างหน้า"
    now = current.get("time")
    series: list[dict] = []
    for moment, speed, direction in zip(times, speeds, directions):
        if now and moment < now[:13]:
            continue
        if speed is None:
            continue
        series.append(
            {
                "time": moment,
                "label": moment[11:16],
                "wind_speed": speed,
                "wind_direction": direction,
                "calm": speed < CALM_THRESHOLD_KMH,
            }
        )
        if len(series) >= hours:
            break

    if not series:
        return None

    speed_now = current.get("wind_speed_10m")
    direction_now = current.get("wind_direction_10m")

    # หาช่วงลมสงบที่ยาวที่สุดที่ติดกันจริง ไม่ใช่ชั่วโมงแรกกับชั่วโมงสุดท้ายที่สงบ
    #
    # เอาชั่วโมงแรกกับสุดท้ายมาคู่กันจะได้ช่วงที่ผิด เพราะชั่วโมงที่ลมสงบไม่จำเป็นต้องติดกัน
    # กรุงเทพฯ วันที่ทดสอบมีชั่วโมงสงบเจ็ดชั่วโมง แต่กระจายอยู่คนละช่วง
    # ถ้ารายงานว่า "ลมสงบ 18:00 – 11:00" จะกลายเป็นบอกว่าสงบยาวสิบเจ็ดชั่วโมงติด ซึ่งไม่จริง
    calm_count = sum(1 for point in series if point["calm"])
    best_start = best_len = run_start = run_len = 0
    for index, point in enumerate(series):
        if point["calm"]:
            if run_len == 0:
                run_start = index
            run_len += 1
            if run_len > best_len:
                best_start, best_len = run_start, run_len
        else:
            run_len = 0

    result = {
        "source": SOURCE,
        "observed_at": now,
        "minutes_behind": _minutes_since(now),
        "wind_speed": speed_now,
        "wind_direction": direction_now,
        "wind_direction_th": describe_direction(direction_now),
        "wind_gusts": current.get("wind_gusts_10m"),
        "level": describe_wind_level(speed_now),
        "levels": [
            {"key": item["key"], "label_th": item["label_th"], "upper_kmh": item["upper_kmh"]}
            for item in WIND_LEVELS
        ],
        "calm_threshold_kmh": CALM_THRESHOLD_KMH,
        # จำนวนชั่วโมงที่ลมสงบทั้งหมด กับช่วงที่สงบติดกันยาวที่สุด เป็นคนละตัวเลข
        # สองอย่างนี้ต่างกันเมื่อชั่วโมงสงบกระจายอยู่หลายช่วง จึงต้องส่งไปทั้งคู่
        "calm_hours": calm_count,
        "calm_run_hours": best_len,
        "calm_from": series[best_start]["label"] if best_len else None,
        "calm_to": series[best_start + best_len - 1]["label"] if best_len else None,
        "hourly": series,
    }

    _wind_cache[key] = (time.time(), result)
    return result


def fetch_wind_many(points: list[tuple[str, float, float]]) -> list[dict]:
    """ลมปัจจุบันของหลายจังหวัดพร้อมกันในคำขอเดียว

    ทำไมต้องรวมเป็นคำขอเดียว
        ถ้าถามทีละจังหวัด เจ็ดสิบสี่จังหวัดคูณยี่สิบสี่รอบต่อวัน
        เท่ากับยิงคำขอไปหาต้นทาง 1,776 ครั้งทุกวัน โดยได้ข้อมูลเท่าเดิม
        Open-Meteo รับพิกัดหลายจุดคั่นด้วยจุลภาคในคำขอเดียวและตอบกลับเป็นรายการ
        เหลือวันละยี่สิบสี่ครั้ง เบาต่อทั้งเราและต้นทาง

    คืนรายการว่างเมื่อเรียกไม่สำเร็จ เพราะเป็นงานเบื้องหลัง
    เก็บพลาดหนึ่งรอบไม่ควรทำให้รอบเก็บค่าฝุ่นทั้งรอบล้มไปด้วย
    """
    if not points:
        return []

    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": ",".join(str(lat) for _, lat, _ in points),
                "longitude": ",".join(str(lon) for _, _, lon in points),
                "current": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                "timezone": "Asia/Bangkok",
            },
            timeout=REQUEST_TIMEOUT,
            verify=CA_BUNDLE,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError):
        return []

    # ต้นทางตอบเป็นรายการเมื่อขอหลายพิกัด แต่ตอบเป็นวัตถุเดียวเมื่อขอจุดเดียว
    # ต้องรับทั้งสองแบบ ไม่งั้นจะพังเมื่อเหลือจังหวัดเดียวที่มีพิกัด
    entries = payload if isinstance(payload, list) else [payload]
    if len(entries) != len(points):
        return []

    result: list[dict] = []
    for (province, _, _), entry in zip(points, entries):
        current = (entry or {}).get("current") or {}
        if current.get("time") is None:
            continue
        result.append(
            {
                "province": province,
                "observed_at": current["time"],
                "wind_speed": current.get("wind_speed_10m"),
                "wind_direction": current.get("wind_direction_10m"),
                "wind_gusts": current.get("wind_gusts_10m"),
            }
        )
    return result
