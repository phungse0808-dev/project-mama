"""เกณฑ์ดัชนีคุณภาพอากาศของประเทศไทย

ประเทศไทยใช้เกณฑ์ AQI 5 ระดับ ซึ่งต่างจากเกณฑ์ของสหรัฐอเมริกา (US EPA)
ที่แบ่ง 6 ระดับ ระบบนี้ยึดเกณฑ์ไทยเพราะเป็นเกณฑ์ที่หน่วยงานไทยใช้สื่อสารกับประชาชน

อ้างอิงค่ามาตรฐาน PM2.5 เฉลี่ย 24 ชั่วโมงของประเทศไทยที่ 37.5 ไมโครกรัมต่อลูกบาศก์เมตร
ซึ่งเป็นรอยต่อระหว่างระดับ "ปานกลาง" กับ "เริ่มมีผลกระทบต่อสุขภาพ"
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class AqiLevel:
    key: str
    label_th: str
    color: str  # สีตามที่กรมควบคุมมลพิษใช้สื่อสาร
    advice_th: str


LEVELS: tuple[AqiLevel, ...] = (
    AqiLevel(
        key="very_good",
        label_th="ดีมาก",
        color="#0099ff",
        advice_th="คุณภาพอากาศดีมาก เหมาะกับกิจกรรมกลางแจ้งทุกประเภท",
    ),
    AqiLevel(
        key="good",
        label_th="ดี",
        color="#00b050",
        advice_th="คุณภาพอากาศดี ทำกิจกรรมกลางแจ้งได้ตามปกติ",
    ),
    AqiLevel(
        key="moderate",
        label_th="ปานกลาง",
        color="#ffd400",
        advice_th="ผู้ที่ต้องดูแลสุขภาพเป็นพิเศษควรลดเวลาทำกิจกรรมกลางแจ้ง",
    ),
    AqiLevel(
        key="unhealthy",
        label_th="เริ่มมีผลกระทบต่อสุขภาพ",
        color="#ff7e00",
        advice_th="ประชาชนทั่วไปควรลดกิจกรรมกลางแจ้ง กลุ่มเสี่ยงควรงดและสวมหน้ากากป้องกัน",
    ),
    AqiLevel(
        key="very_unhealthy",
        label_th="มีผลกระทบต่อสุขภาพ",
        color="#ff0000",
        advice_th="ทุกคนควรงดกิจกรรมกลางแจ้ง หากจำเป็นต้องออกนอกอาคารให้สวมหน้ากากป้องกันฝุ่น",
    ),
)

# ขอบบนของค่า AQI ในแต่ละระดับ ระดับสุดท้ายไม่มีขอบบน
_AQI_UPPER = (25, 50, 100, 200)

# ขอบบนของค่า PM2.5 เฉลี่ย 24 ชั่วโมง หน่วยไมโครกรัมต่อลูกบาศก์เมตร
_PM25_UPPER = (15.0, 25.0, 37.5, 75.0)


def level_ceiling_pm25(level_key: str) -> float | None:
    """ค่า PM2.5 สูงสุดที่ยังอยู่ในระดับนั้น ระดับสุดท้ายไม่มีขอบบนจึงคืนค่าว่าง

    ใช้เขียนคำอธิบายสีบนแผนที่ ให้ตัวเลขบนหน้าเว็บมาจากที่เดียวกับที่ใช้ตัดสินระดับจริง
    ไม่ใช่พิมพ์ซ้ำไว้ในหน้าเว็บ ซึ่งจะเพี้ยนถ้าวันหลังเกณฑ์เปลี่ยน
    """
    for index, level in enumerate(LEVELS):
        if level.key == level_key:
            return _PM25_UPPER[index] if index < len(_PM25_UPPER) else None
    return None


def level_from_aqi(aqi: int | None) -> AqiLevel | None:
    """แปลงค่า AQI เป็นระดับคุณภาพอากาศ"""
    if aqi is None or aqi < 0:
        return None
    for index, upper in enumerate(_AQI_UPPER):
        if aqi <= upper:
            return LEVELS[index]
    return LEVELS[-1]


def level_from_pm25(pm25: float | None) -> AqiLevel | None:
    """แปลงค่าความเข้มข้น PM2.5 เป็นระดับคุณภาพอากาศ

    ใช้เมื่อสถานีส่งค่าฝุ่นมาแต่ไม่ได้ส่งค่า AQI
    """
    if pm25 is None or pm25 < 0:
        return None
    for index, upper in enumerate(_PM25_UPPER):
        if pm25 <= upper:
            return LEVELS[index]
    return LEVELS[-1]


def describe(aqi: int | None, pm25: float | None) -> dict:
    """สรุประดับคุณภาพอากาศให้พร้อมส่งออกทาง API"""
    level = level_from_aqi(aqi) or level_from_pm25(pm25)
    if level is None:
        return {"key": None, "label_th": "ไม่มีข้อมูล", "color": "#9aa1ab", "advice_th": ""}
    return {
        "key": level.key,
        "label_th": level.label_th,
        "color": level.color,
        "advice_th": level.advice_th,
    }
