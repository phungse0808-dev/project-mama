"""พยากรณ์ค่าฝุ่นพรุ่งนี้และมะรืนแบบเดโม จากค่าเฉลี่ย 24 ชั่วโมงสองช่วงล่าสุดกับสภาพอากาศ

เป็นเดโม ยังใช้งานจริงไม่ได้
    ข้อมูลที่ใช้เป็นค่าจริงทั้งหมด แต่สูตรยังไม่ได้ทดสอบความแม่นกับข้อมูลย้อนหลัง
    บางส่วนมีงานวิจัยรองรับ บางส่วนผู้จัดทำกำหนดเอง หน้าเว็บต้องบอกทั้งสองอย่างให้เห็น

ที่มาของโครงสูตร
    ไม่ได้ยกมาจากเอกสารใด ผู้จัดทำออกแบบเองเพื่อสาธิต
    แนวคิดคือใช้ค่าล่าสุดเป็นฐาน บวกแนวโน้ม แล้วปรับตามสภาพอากาศ

สูตร
    (1) t   = ชั่วโมงล่าสุดที่มีค่าฝุ่นของจังหวัด
        C₀  = ค่าเฉลี่ย PM2.5 ทุกสถานีในจังหวัด ช่วง (t − 24 ชม., t]
        C₋₁ = ค่าเฉลี่ยแบบเดียวกัน ช่วง (t − 48 ชม., t − 24 ชม.]
        ใช้ค่าเฉลี่ย 24 ชั่วโมงเพราะมาตรฐาน PM2.5 ของไทยและ WHO เป็นค่าเฉลี่ย 24 ชั่วโมง
        และครบ 24 ชั่วโมงเสมอไม่ว่าเปิดดูตอนไหน ต่างจากค่าตามวันปฏิทินที่ตอนเช้ามีไม่กี่ชั่วโมง

    (2) C′ = C₀ + 0.5 × (C₀ − C₋₁)
        ใช้ C₀ เป็นฐาน ตามวิธี persistence ที่ใช้เป็นเกณฑ์เทียบในงานพยากรณ์ PM2.5 [1]
        ตัวคูณ 0.5 ผู้จัดทำกำหนด

    (3) ตัวปรับตามสภาพอากาศของช่วงที่พยากรณ์ ค่อย ๆ ลดตามระดับ ไม่ใช้เกณฑ์ตัด
        ช่วงที่พยากรณ์คือ 24 ชม. ถัดไปต่อจากช่วงล่าสุดพอดี (t, t + 24 ชม.] และ (t + 24, t + 48 ชม.]
        อากาศใช้ค่าพยากรณ์รายชั่วโมงของ Open-Meteo รวมเฉพาะชั่วโมงในช่วงนั้น
        f_ฝน     = 1 − 0.20 × R/100                          R = โอกาสฝนสูงสุด %  [2][3]
        f_ลม     = 1 − 0.10 × min(W, 30)/30                  W = ลมแรงสุด km/h    [4]
        f_ชื้น    = 1 − 0.05 × max(0, H − 60)/40               H = ความชื้นเฉลี่ย %  [5]
        f_ร้อน    = 1 − 0.05 × min(1, max(0, (T − 25)/10))     T = อุณหภูมิสูงสุด °C [5]
        ฝนลดสูงสุด 20% มีงานวิจัยรองรับ
        ลม ความชื้น อุณหภูมิ งานวิจัยรองรับเฉพาะทิศทาง ขนาดผลและจุดเริ่มผู้จัดทำกำหนด

    (4) พรุ่งนี้ Ĉ₊₁ = max(0, C′ × f_ฝน × f_ลม × f_ชื้น × f_ร้อน)   ช่วง (t, t + 24 ชม.]

    (5) มะรืน คิดต่อจากพรุ่งนี้ C″ = Ĉ₊₁ + 0.5 × (Ĉ₊₁ − C₀) แล้วคูณตัวปรับด้วยอากาศของช่วง (t + 24, t + 48 ชม.]
        ข้อจำกัด ต่อจากค่าที่พยากรณ์อีกทอด ความคลาดเคลื่อนสะสม

เอกสารอ้างอิง อยู่ใน REFERENCES ด้านล่าง ส่งให้หน้าเว็บแสดงจากที่เดียวกัน
"""

import time
from decimal import ROUND_HALF_UP, Decimal
from datetime import datetime, timedelta

import requests
from sqlmodel import Session, col, func, select

from app.aqi import describe
from app.config import CA_BUNDLE, REQUEST_TIMEOUT
from app.forecast import OPEN_METEO_URL, SOURCE as OPEN_METEO_SOURCE
from app.models import Reading, Station

TREND_WEIGHT = 0.5
# ลดได้สูงสุดเท่าไรเมื่ออากาศถึงระดับเต็ม
RAIN_MAX_CUT = 0.20
WIND_MAX_CUT = 0.10
HUMIDITY_MAX_CUT = 0.05
HEAT_MAX_CUT = 0.05

# ช่วงที่ค่อย ๆ ลด
WIND_FULL_KMH = 30
HUMIDITY_FROM_PCT = 60
HUMIDITY_SPAN_PCT = 40
HEAT_FROM_C = 25
HEAT_SPAN_C = 10

WINDOW_HOURS = 24

CACHE_SECONDS = 600
_weather_cache: dict[tuple[float, float], tuple[float, dict]] = {}

# หน่วยงานที่พยากรณ์ฝุ่น พร้อมวิธีที่แต่ละแห่งใช้
#
# ใส่ไว้เพื่อให้คนอ่านเห็นว่างานพยากรณ์ฝุ่นจริง ๆ เขาทำกันอย่างไร และสูตรสาธิตของระบบนี้
# อยู่ตรงไหนเมื่อเทียบกับเขา ไม่ใช่เพื่อบอกว่าระบบนี้เทียบชั้นได้
#
# use  = ระบบนี้ดึงข้อมูลจากหน่วยงานนี้มาใช้จริง
# ref  = ไม่ได้ใช้ข้อมูล แต่ระบบอ้างอิงวิธีคิดของหน่วยงานนี้
# none = ไม่ได้ใช้เลย ยกมาเป็นตัวอย่างงานประเภทเดียวกัน
#
# ข้อมูลของ CAMS และ NOAA ยืนยันจากเอกสารของหน่วยงานเอง
# ส่วนของไทย จีน และ IQAir เป็นภาพรวมจากงานวิจัยและข่าว ยังไม่ใช่เอกสารทางการของหน่วยงาน
# ก่อนนำไปเขียนในเล่มต้องหาต้นทางยืนยันอีกชั้น
# สมการอนุรักษ์มวลของสารในบรรยากาศ ฐานเดียวกันของ CAMS CMAQ และ WRF-Chem
# เป็นรูปทั่วไป ของจริงแต่ละแบบจำลองมีรายละเอียดมากกว่านี้
# ที่มา CMAQ Science Documentation บทที่ 6
MASS_BALANCE = "∂C/∂t = −∇·(uC) + ∇·(K∇C) + R(C) + E − S"
MASS_BALANCE_NOTE = (
    "C ความเข้มข้น · u ลม · K สัมประสิทธิ์การผสม · R ปฏิกิริยาเคมี · E การปล่อย · S การตกสะสม"
)

AGENCIES: list[dict] = [
    {
        "name_th": "Copernicus Atmosphere Monitoring Service (CAMS) โดย ECMWF สหภาพยุโรป",
        "system_th": "แบบจำลอง IFS-COMPO · พยากรณ์ทั่วโลกล่วงหน้าถึง 5 วัน",
        "method_th": (
            "ใช้แบบจำลองบรรยากาศเชิงฟิสิกส์ตัวเดียวกับที่พยากรณ์อากาศ แล้วเปิดโมดูลฝุ่นละออง "
            "ก๊าซปฏิกิริยา และก๊าซเรือนกระจกเพิ่ม ดึงข้อมูลดาวเทียมมาปรับค่าเริ่มต้นด้วยวิธี "
            "4D-Var data assimilation แบ่งชั้นบรรยากาศ 137 ชั้น"
        ),
        "use": "use",
        "use_th": "ระบบนี้ใช้ค่าพยากรณ์อากาศจากที่นี่ผ่านบริการ Open-Meteo",
        "formula": MASS_BALANCE,
        "formula_note_th": MASS_BALANCE_NOTE,
        "url": "https://confluence.ecmwf.int/display/CKB/CAMS%3A+Global+atmospheric+composition+forecast+data+documentation",
    },
    {
        "name_th": "NOAA ร่วมกับ US EPA สหรัฐอเมริกา ระบบ AirNow",
        "system_th": "ระบบ NAQFC · พยากรณ์วันละสองรอบ ล่วงหน้า 72 ชั่วโมง ให้บริการตั้งแต่ปี 2547",
        "method_th": (
            "ใช้แบบจำลอง CMAQ ซึ่งจำลองการกระจายตัวของมลพิษหลายมาตราส่วน ขับด้วยผลพยากรณ์อากาศ "
            "จากแบบจำลอง GFS และป้อนบัญชีการปล่อยมลพิษระดับประเทศเข้าไปคำนวณ"
        ),
        "use": "ref",
        "use_th": "ระบบนี้ไม่ได้ใช้ข้อมูล แต่อ้างอิงวิธีคิดของดัชนีคุณภาพอากาศ",
        "formula": "I = (I_สูง − I_ต่ำ) ÷ (C_สูง − C_ต่ำ) × (C − C_ต่ำ) + I_ต่ำ",
        "formula_note_th": (
            "สมการเส้นตรงแปลงความเข้มข้น C เป็นค่าดัชนี I โดยเทียบช่วงที่ค่านั้นตกอยู่ "
            "ประเทศไทยใช้วิธีเดียวกันแต่เปลี่ยนช่วงค่าเป็นเกณฑ์ของไทย "
            "ส่วนตัวแบบจำลอง CMAQ ใช้สมการอนุรักษ์มวลชุดเดียวกับ CAMS"
        ),
        "url": "https://www.emc.ncep.noaa.gov/mmb/aq/",
    },
    {
        "name_th": "กรมควบคุมมลพิษ กระทรวงทรัพยากรธรรมชาติและสิ่งแวดล้อม ประเทศไทย",
        "system_th": "ระบบ Air4Thai · เจ้าของสถานีตรวจวัดทั่วประเทศ",
        "method_th": (
            "งานพยากรณ์ฝุ่นในประเทศไทยใช้แบบจำลอง WRF-Chem ซึ่งรวมการพยากรณ์อากาศ "
            "เข้ากับเคมีบรรยากาศ มีงานวิจัยที่ประเมินผลแบบจำลองนี้กับพื้นที่ในประเทศไทย"
        ),
        "use": "use",
        "use_th": "ระบบนี้ใช้ค่าฝุ่นรายชั่วโมงจากสถานีของหน่วยงานนี้เป็นค่าตั้งต้นของสูตร",
        "formula": MASS_BALANCE,
        "formula_note_th": "WRF-Chem รวมการพยากรณ์อากาศเข้ากับเคมีบรรยากาศ จึงใช้สมการชุดเดียวกัน",
        "url": "http://air4thai.pcd.go.th/",
    },
    {
        "name_th": "CNEMC ศูนย์ติดตามสิ่งแวดล้อมแห่งชาติ ประเทศจีน",
        "system_th": "พยากรณ์ฝุ่นระดับประเทศ",
        "method_th": "ใช้แบบจำลองเคมีบรรยากาศร่วมกับการเรียนรู้ของเครื่อง",
        "use": "none",
        "use_th": "ยกมาเป็นตัวอย่างงานประเภทเดียวกัน ระบบนี้ไม่ได้ใช้",
        "formula": "ไม่เปิดเผยสูตรที่ใช้จริง",
        "formula_note_th": "",
        "url": "https://www.cnemc.cn/",
    },
    {
        "name_th": "IQAir บริษัทเอกชน ประเทศสวิตเซอร์แลนด์",
        "system_th": "แอปพลิเคชันและเว็บไซต์ที่คนทั่วไปใช้ดูค่าฝุ่น",
        "method_th": (
            "รวบรวมค่าจากสถานีของราชการและเซ็นเซอร์ของประชาชนทั่วโลก "
            "แล้วพยากรณ์ด้วยแบบจำลองทางสถิติ"
        ),
        "use": "none",
        "use_th": "ยกมาเป็นตัวอย่างงานประเภทเดียวกัน ระบบนี้ไม่ได้ใช้",
        "formula": "ไม่เปิดเผยสูตรที่ใช้จริง เป็นของบริษัทเอกชน",
        "formula_note_th": "",
        "url": "https://www.iqair.com/",
    },
]

# สูตรของระบบนี้แบบย่อบรรทัดเดียว วางเทียบกับสมการของหน่วยงานอื่นได้ตรง ๆ
OUR_FORMULA = "Ĉ = (C₀ + 0.5 × (C₀ − C₋₁)) × f_ฝน × f_ลม × f_ชื้น × f_ร้อน"

# สรุปวิธีของระบบนี้ วางไว้ท้ายรายการหน่วยงานเพื่อให้เทียบกันได้ในสายตาเดียว
OUR_METHOD_TH = (
    "ใช้ค่าเฉลี่ย 24 ชั่วโมงล่าสุดของสถานีในจังหวัดเป็นฐาน บวกแนวโน้มจากช่วงก่อนหน้า "
    "แล้วคูณตัวปรับตามสภาพอากาศ ไม่ได้จำลองการเคลื่อนที่ของอากาศหรือปฏิกิริยาเคมีใด ๆ "
    "ต่างจากหน่วยงานข้างบนที่คำนวณจากฟิสิกส์ของบรรยากาศทั้งก้อน ส่วนระบบนี้คำนวณจากค่าที่วัดได้ในพื้นที่"
)

REFERENCES = [
    {
        "id": 1,
        "text": "Berlinghieri, R., Burt, D. R., Giani, P., Fiore, A. M., et al. (2024). Are hourly PM2.5 "
        "forecasts sufficiently accurate to plan your day? Individual decision making in the face of "
        "increasing wildfire smoke. arXiv:2409.05866",
        "url": "https://arxiv.org/abs/2409.05866",
    },
    {
        "id": 2,
        "text": "Fujino, R., & Miyamoto, Y. (2022). PM2.5 decrease with precipitation as revealed by "
        "single-point ground-based observation. Atmospheric Science Letters.",
        "url": "https://doi.org/10.1002/asl.1088",
    },
    {
        "id": 3,
        "text": "Lu, X., Chan, S. C., & Fung, J. C. H. (2019). To what extent can the below-cloud washout "
        "effect influence the PM2.5? A combined observational and modeling study. Environmental Pollution.",
        "url": "https://doi.org/10.1016/j.envpol.2019.04.061",
    },
    {
        "id": 4,
        "text": "Aman, N., Panyametheekul, S., Pawarmart, I., Xian, D., Gao, L., Tian, L., Manomaiphiboon, K., "
        "& Wang, Y. (2025). Machine learning-based quantification and separation of emissions and "
        "meteorological effects on PM2.5 in Greater Bangkok. Scientific Reports.",
        "url": "https://doi.org/10.1038/s41598-025-99094-6",
    },
    {
        "id": 5,
        "text": "Vongruang, P., Suppoung, S., Kirtsaeng, S., Prueksakorn, K., Thao, P. T. B., & Pimonsree, S. "
        "(2024). Development of meteorological criteria for classifying PM2.5 risk in a coastal industrial "
        "province in Thailand. Aerosol and Air Quality Research.",
        "url": "https://doi.org/10.4209/aaqr.230321",
    },
]

FORMULA = [
    "C₀ = ค่าเฉลี่ย PM2.5 ทุกสถานีในจังหวัด 24 ชม. ล่าสุด · C₋₁ = ค่าเฉลี่ย 24 ชม. ก่อนหน้านั้น",
    "C′ = C₀ + 0.5 × (C₀ − C₋₁)",
    "f_ฝน = 1 − 0.20 × โอกาสฝน/100",
    "f_ลม = 1 − 0.10 × min(ลมแรงสุด, 30)/30",
    "f_ชื้น = 1 − 0.05 × max(0, ความชื้นเฉลี่ย − 60)/40",
    "f_ร้อน = 1 − 0.05 × min(1, max(0, (ร้อนสุด − 25)/10))",
    "พรุ่งนี้ = max(0, C′ × f_ฝน × f_ลม × f_ชื้น × f_ร้อน) · ช่วง 24 ชม. ถัดไปต่อจากช่วงล่าสุด",
    "มะรืน = คิดต่อจากพรุ่งนี้ ใช้ C₀ กับค่าพรุ่งนี้เป็นสองช่วงล่าสุด และอากาศของ 24 ชม. ถัดจากนั้น",
    "อากาศของแต่ละช่วงรวมจากค่ารายชั่วโมง: ฝน = โอกาสฝนสูงสุด · ลม = ลมแรงสุด · ชื้น = ความชื้นเฉลี่ย · ร้อน = อุณหภูมิสูงสุด",
]


def window_average(
    session: Session, province: str, start: datetime, end: datetime
) -> tuple[float | None, int, int]:
    """ค่าฝุ่นเฉลี่ยทุกสถานีในจังหวัด ช่วง (start, end] คืนค่าเฉลี่ย จำนวนค่า และจำนวนสถานีที่ส่งค่า

    เวลาในฐานข้อมูลเป็นเวลาไทยตามต้นทางอยู่แล้ว
    """
    avg, count, stations = session.exec(
        select(
            func.avg(Reading.pm25),
            func.count(col(Reading.pm25)),
            func.count(func.distinct(Reading.station_id)),
        )
        .join(Station, col(Reading.station_id) == col(Station.id))
        .where(
            Station.province == province,
            col(Reading.pm25).is_not(None),
            Reading.measured_at > start,
            Reading.measured_at <= end,
        )
    ).one()
    return (round(float(avg), 1) if avg is not None else None), int(count or 0), int(stations or 0)


def latest_hour(session: Session, province: str) -> datetime | None:
    """ชั่วโมงล่าสุดที่มีค่าฝุ่นของจังหวัด"""
    return session.exec(
        select(func.max(Reading.measured_at))
        .join(Station, col(Reading.station_id) == col(Station.id))
        .where(Station.province == province, col(Reading.pm25).is_not(None))
    ).one()


def fetch_hourly(latitude: float, longitude: float) -> dict | None:
    """ค่าพยากรณ์อากาศรายชั่วโมง 4 วันจาก Open-Meteo เวลาไทย คืน None เมื่อเรียกไม่สำเร็จ"""
    key = (round(latitude, 2), round(longitude, 2))
    cached = _weather_cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    try:
        response = requests.get(
            OPEN_METEO_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "hourly": "precipitation_probability,wind_speed_10m,relative_humidity_2m,temperature_2m",
                "forecast_days": 4,
                "timezone": "Asia/Bangkok",
            },
            timeout=REQUEST_TIMEOUT,
            verify=CA_BUNDLE,
        )
        response.raise_for_status()
        hourly = response.json()["hourly"]
        result = {
            "time": [datetime.fromisoformat(value) for value in hourly["time"]],
            "rain": hourly["precipitation_probability"],
            "wind": hourly["wind_speed_10m"],
            "humidity": hourly["relative_humidity_2m"],
            "heat": hourly["temperature_2m"],
        }
    except (requests.RequestException, ValueError, KeyError, TypeError):
        return None

    _weather_cache[key] = (time.time(), result)
    return result


def window_weather(hourly: dict, start: datetime, end: datetime) -> dict | None:
    """รวมอากาศรายชั่วโมงในช่วง (start, end] เป็นค่าเดียวต่อตัวแปร

    ฝนกับลมกับอุณหภูมิใช้ค่าสูงสุด เพราะสิ่งที่ชะหรือพัดฝุ่นคือช่วงที่แรงที่สุด
    ความชื้นใช้ค่าเฉลี่ย เพราะบอกสภาพทั้งช่วงว่าเป็นช่วงฝนหรือไม่
    คืน None เมื่อต้นทางมีข้อมูลไม่ครบช่วง
    """
    index = [i for i, moment in enumerate(hourly["time"]) if start < moment <= end]
    if len(index) < WINDOW_HOURS:
        return None

    def values(name: str) -> list[float]:
        return [hourly[name][i] for i in index if hourly[name][i] is not None]

    rain, wind, humidity, heat = values("rain"), values("wind"), values("humidity"), values("heat")
    return {
        "rain_chance_pct": max(rain) if rain else None,
        "wind_max_kmh": max(wind) if wind else None,
        "humidity_mean_pct": round(sum(humidity) / len(humidity)) if humidity else None,
        "temp_max_c": max(heat) if heat else None,
    }


def _half_up(value: float | Decimal, places: int) -> float:
    """ปัดแบบที่คนคิดด้วยมือ .5 ปัดขึ้นเสมอ round ของ Python ปัดตามเลขฐานสองซึ่งบางค่าปัดลง"""
    step = Decimal(1).scaleb(-places)
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    return float(number.quantize(step, rounding=ROUND_HALF_UP))


def _times(a: float, b: float) -> Decimal:
    """คูณแบบทศนิยมตรงตัว ไม่ผ่านเลขฐานสอง ผลจึงตรงกับที่คิดด้วยมือ"""
    return Decimal(str(a)) * Decimal(str(b))


def _clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def predict(previous: float, current: float, weather: dict) -> tuple[float, list[dict]]:
    """ค่าฝุ่นของวันที่พยากรณ์ คืนค่ากับขั้นตอนคำนวณแบบอ่านง่าย

    แต่ละขั้นบอก ชื่อ เหตุผลสั้น ๆ ผลของขั้น (บวกเท่าไรหรือลดกี่เปอร์เซ็นต์) วิธีคำนวณด้วยตัวเลขจริง ค่าหลังขั้นนั้น
    และที่มา research มีงานวิจัยรองรับ · direction งานวิจัยรองรับแค่ทิศทาง · assumption ผู้จัดทำกำหนด
    ตัวแปรอากาศที่ต้นทางไม่ส่งมา ถือว่าไม่มีผล
    """
    # ปัดทศนิยมทุกขั้นก่อนคิดขั้นถัดไป ให้ตัวเลขที่แสดงคิดตามด้วยมือแล้วได้ผลตรงกัน
    # ถ้าคิดด้วยค่าเต็มแต่แสดงค่าปัด บางขั้นจะเห็นเช่น 7.9 × 0.972 = 7.6 ซึ่งคิดตามแล้วได้ 7.7
    current = _half_up(current, 1)
    previous = _half_up(previous, 1)
    trend = _half_up(Decimal(str(current)) - Decimal(str(previous)), 1)
    value = _half_up(Decimal(str(current)) + _times(trend, TREND_WEIGHT), 1)
    steps = [
        {
            "icon": "base",
            "title": "เริ่มจากค่าล่าสุด",
            "detail": "ค่าข้างหน้ามักใกล้เคียงค่าล่าสุด",
            "effect": "",
            "calc": f"C₀ = {current:.1f}",
            "value": round(current, 1),
            "evidence": "research",
            "refs": [1],
        },
        {
            "icon": "trend",
            "title": "ดูแนวโน้ม",
            "detail": f"ช่วงล่าสุด{'สูงกว่า' if trend >= 0 else 'ต่ำกว่า'}ช่วงก่อน {abs(trend):.1f} → นับครึ่งหนึ่ง",
            "effect": f"{'+' if trend >= 0 else '−'}{abs(trend * TREND_WEIGHT):.1f}",
            "calc": f"{current:.1f} + {TREND_WEIGHT} × ({current:.1f} − {previous:.1f}) = {value:.1f}",
            "value": round(value, 1),
            "evidence": "assumption",
            "refs": [],
        },
    ]

    rain = weather.get("rain_chance_pct")
    wind = weather.get("wind_max_kmh")
    humidity = weather.get("humidity_mean_pct")
    heat = weather.get("temp_max_c")

    # นิพจน์ในวงเล็บเขียนแบบเดียวกับที่คำนวณจริง ใส่ min หรือ max เฉพาะตอนที่ค่าหลุดช่วงจริง
    # คนอ่านจะได้คิดตามได้ตรงกับตัวเลข ไม่งั้นใส่ค่าลงสูตรธรรมดาแล้วจะได้ตัวคูณไม่ตรงกับที่เห็น
    def wind_expr(w: float) -> str:
        inner = f"min({w}, {WIND_FULL_KMH})" if w > WIND_FULL_KMH else f"{w}"
        return f"1 − {WIND_MAX_CUT:.2f} × {inner}/{WIND_FULL_KMH}"

    def humidity_expr(h: float) -> str:
        inner = f"max(0, {h} − {HUMIDITY_FROM_PCT})" if h < HUMIDITY_FROM_PCT else f"({h} − {HUMIDITY_FROM_PCT})"
        if h > HUMIDITY_FROM_PCT + HUMIDITY_SPAN_PCT:
            inner = f"min({HUMIDITY_SPAN_PCT}, {h} − {HUMIDITY_FROM_PCT})"
        return f"1 − {HUMIDITY_MAX_CUT:.2f} × {inner}/{HUMIDITY_SPAN_PCT}"

    def heat_expr(c: float) -> str:
        if c < HEAT_FROM_C:
            inner = f"max(0, {c} − {HEAT_FROM_C})"
        elif c > HEAT_FROM_C + HEAT_SPAN_C:
            inner = f"min({HEAT_SPAN_C}, {c} − {HEAT_FROM_C})"
        else:
            inner = f"({c} − {HEAT_FROM_C})"
        return f"1 − {HEAT_MAX_CUT:.2f} × {inner}/{HEAT_SPAN_C}"

    factors = [
        ("rain", f"ฝน {rain}%", "ฝนชะฝุ่นลงพื้น", "research", [2, 3],
         None if rain is None else 1 - RAIN_MAX_CUT * _clamp01(rain / 100),
         None if rain is None else f"1 − {RAIN_MAX_CUT:.2f} × {rain}/100"),
        ("wind", f"ลม {wind} km/h", "ลมพัดฝุ่นกระจาย", "direction", [4],
         None if wind is None else 1 - WIND_MAX_CUT * _clamp01(wind / WIND_FULL_KMH),
         None if wind is None else wind_expr(wind)),
        ("humidity", f"ความชื้น {humidity}%", "ชื้นมาก มักเป็นช่วงฝน", "direction", [5],
         None if humidity is None
         else 1 - HUMIDITY_MAX_CUT * _clamp01((humidity - HUMIDITY_FROM_PCT) / HUMIDITY_SPAN_PCT),
         None if humidity is None else humidity_expr(humidity)),
        ("heat", f"ร้อนสุด {heat}°C", "อากาศร้อน ฝุ่นลอยขึ้นกระจาย", "direction", [5],
         None if heat is None else 1 - HEAT_MAX_CUT * _clamp01((heat - HEAT_FROM_C) / HEAT_SPAN_C),
         None if heat is None else heat_expr(heat)),
    ]
    for icon, title, detail, evidence, refs, factor, expr in factors:
        if factor is None:
            steps.append({"icon": icon, "title": title, "detail": "ต้นทางไม่ส่งค่ามา · ไม่ปรับ", "effect": "",
                          "calc": "", "value": round(value, 1), "evidence": evidence, "refs": refs})
            continue
        before = value
        factor = _half_up(factor, 3)
        value = _half_up(_times(before, factor), 1)
        steps.append({
            "icon": icon,
            "title": title,
            "detail": detail,
            "effect": f"−{round((1 - factor) * 100)}%",
            "calc": f"{before:.1f} × ({expr}) = {before:.1f} × {factor:.3f} = {value:.1f}",
            "value": round(value, 1),
            "evidence": evidence,
            "refs": refs,
        })

    return max(0.0, round(value, 1)), steps


def window_payload(start: datetime, end: datetime, avg: float | None, readings: int, stations: int) -> dict:
    return {
        "stations": stations,
        "start": start.isoformat(timespec="minutes"),
        "end": end.isoformat(timespec="minutes"),
        "pm25": avg,
        "readings": readings,
        "level": describe(None, avg) if avg is not None else None,
    }


def forecast_payload(start: datetime, end: datetime, weather: dict, value: float, reference: float) -> dict:
    """การ์ดพยากรณ์หนึ่งช่วง change คือส่วนต่างจากช่วงก่อนหน้า"""
    return {
        "start": (start + timedelta(hours=1)).isoformat(timespec="minutes"),
        "end": end.isoformat(timespec="minutes"),
        "pm25": value,
        "change": round(value - reference, 1),
        "level": describe(None, value),
        **weather,
    }


def forecast_demo(session: Session, province: str, coords: tuple[float, float] | None) -> dict:
    """ค่าเฉลี่ย 24 ชม. ก่อนหน้า 24 ชม. ล่าสุด ค่าพยากรณ์พรุ่งนี้ และค่าพยากรณ์มะรืน"""
    base = {
        "province": province,
        "pm25_source": "Air4Thai กรมควบคุมมลพิษ · ค่ารายชั่วโมงที่ระบบเก็บไว้ เฉลี่ยทุกสถานีในจังหวัด",
        "weather_source": f"{OPEN_METEO_SOURCE} · พยากรณ์รายชั่วโมง รวมเป็นช่วง 24 ชม. ถัดไปสองช่วง",
        "formula": FORMULA,
        "references": REFERENCES,
        "agencies": AGENCIES,
        "our_method_th": OUR_METHOD_TH,
        "our_formula": OUR_FORMULA,
        "mass_balance_note_th": (
            "สมการของ CAMS CMAQ และ WRF-Chem ที่แสดงเป็นรูปทั่วไปของสมการอนุรักษ์มวล "
            "ตามเอกสาร CMAQ Science Documentation บทที่ 6 ของจริงซับซ้อนกว่านี้มาก"
        ),
    }

    end = latest_hour(session, province)
    if end is None:
        return {**base, "available": False, "reason": "ยังไม่มีค่าฝุ่นของจังหวัดนี้"}

    middle = end - timedelta(hours=WINDOW_HOURS)
    start = middle - timedelta(hours=WINDOW_HOURS)
    latest_avg, latest_n, latest_st = window_average(session, province, middle, end)
    previous_avg, previous_n, previous_st = window_average(session, province, start, middle)
    # ช่วงที่แสดงนับชั่วโมงแรกที่อยู่ในช่วงจริง เช่น 13:00 ถึง 12:00 ไม่ใช่ 12:00 ถึง 12:00
    base["latest"] = window_payload(middle + timedelta(hours=1), end, latest_avg, latest_n, latest_st)
    base["previous"] = window_payload(start + timedelta(hours=1), middle, previous_avg, previous_n, previous_st)

    if latest_avg is None or previous_avg is None:
        return {**base, "available": False, "reason": "ค่าฝุ่น 48 ชั่วโมงล่าสุดของจังหวัดนี้ไม่ครบสองช่วง"}

    hourly = fetch_hourly(*coords) if coords else None
    if hourly is None:
        return {**base, "available": False, "reason": "เรียกสภาพอากาศจาก Open-Meteo ไม่สำเร็จ"}

    # สองช่วงข้างหน้าต่อจากช่วงล่าสุดพอดี ป้ายเวลาของทั้งสี่การ์ดจึงเป็นชั่วโมงเดียวกัน
    next_end = end + timedelta(hours=WINDOW_HOURS)
    after_end = next_end + timedelta(hours=WINDOW_HOURS)
    tomorrow_weather = window_weather(hourly, end, next_end)
    day_after_weather = window_weather(hourly, next_end, after_end)
    if tomorrow_weather is None or day_after_weather is None:
        return {**base, "available": False, "reason": "ค่าพยากรณ์อากาศรายชั่วโมงไม่ครบสองช่วงข้างหน้า"}

    tomorrow_value, steps = predict(previous_avg, latest_avg, tomorrow_weather)
    day_after_value, day_after_steps = predict(latest_avg, tomorrow_value, day_after_weather)

    return {
        **base,
        "available": True,
        "tomorrow": forecast_payload(end, next_end, tomorrow_weather, tomorrow_value, latest_avg),
        "day_after": forecast_payload(next_end, after_end, day_after_weather, day_after_value, tomorrow_value),
        "steps": steps,
        "day_after_steps": day_after_steps,
    }
