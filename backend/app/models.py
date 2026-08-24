"""โครงสร้างตารางฐานข้อมูลของระบบเฝ้าระวังคุณภาพอากาศ

หลักการออกแบบสำคัญ 2 ข้อ
    1. กันข้อมูลซ้ำที่ระดับฐานข้อมูลด้วย UniqueConstraint ไม่ใช่กันในโค้ด
       เพราะตัวเก็บข้อมูลอาจรันซ้ำหรือรันเหลื่อมเวลากันได้
    2. เก็บทั้งค่าที่วัดได้ (value) และค่าดัชนี (aqi) แยกกัน
       เพราะดัชนีคำนวณจากค่าเฉลี่ยย้อนหลังตามเกณฑ์ ไม่ใช่ค่า ณ ขณะนั้น
"""

from datetime import date, datetime

from sqlmodel import Field, SQLModel, UniqueConstraint


def _now() -> datetime:
    """เวลาปัจจุบันตามเขตเวลาของเครื่อง

    ทั้งระบบใช้เวลาประเทศไทย (UTC+7) เหมือนกันหมด เพราะ measured_at
    ที่ได้จาก Air4Thai เป็นเวลาไทยอยู่แล้ว ถ้าเก็บ log เป็น UTC ปนเข้ามา
    การคำนวณช่วงเวลาจะคลาดเคลื่อนไป 7 ชั่วโมงโดยไม่มีใครสังเกต
    """
    return datetime.now()


class Station(SQLModel, table=True):
    """สถานีตรวจวัดคุณภาพอากาศของกรมควบคุมมลพิษ"""

    id: int | None = Field(default=None, primary_key=True)
    station_code: str = Field(index=True, unique=True)  # เช่น "35t"
    name_th: str
    name_en: str
    area_th: str
    area_en: str
    province: str = Field(index=True)  # แยกออกมาจาก area_th เพื่อ query ง่าย
    station_type: str
    latitude: float
    longitude: float
    is_active: bool = True
    first_seen: datetime = Field(default_factory=_now)
    last_seen: datetime = Field(default_factory=_now)


class Reading(SQLModel, table=True):
    """ค่าตรวจวัดรายชั่วโมงของหนึ่งสถานี

    UniqueConstraint กันไม่ให้บันทึกชั่วโมงเดียวกันซ้ำ
    ถ้าเก็บซ้ำโดยไม่กัน โมเดลพยากรณ์จะให้น้ำหนักช่วงเวลานั้นเกินจริง
    """

    __table_args__ = (UniqueConstraint("station_id", "measured_at", name="uq_station_hour"),)

    id: int | None = Field(default=None, primary_key=True)
    station_id: int = Field(foreign_key="station.id", index=True)
    measured_at: datetime = Field(index=True)  # เวลาที่ค่านี้เป็นตัวแทน (ต้นชั่วโมง)

    pm25: float | None = None
    pm10: float | None = None
    o3: float | None = None
    co: float | None = None
    no2: float | None = None
    so2: float | None = None

    aqi: int | None = None
    aqi_param: str | None = None  # สารมลพิษที่ทำให้ AQI สูงสุดในชั่วโมงนั้น

    collected_at: datetime = Field(default_factory=_now)


class WeatherDaily(SQLModel, table=True):
    """ข้อมูลอากาศรายวันจาก NASA POWER ใช้เป็นตัวแปรต้นของโมเดลพยากรณ์"""

    __table_args__ = (UniqueConstraint("province", "observed_on", name="uq_province_day"),)

    id: int | None = Field(default=None, primary_key=True)
    province: str = Field(index=True)
    observed_on: date = Field(index=True)
    latitude: float
    longitude: float

    temp_avg: float | None = None
    temp_max: float | None = None
    temp_min: float | None = None
    rainfall_mm: float | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    pressure: float | None = None

    collected_at: datetime = Field(default_factory=_now)


class AppUser(SQLModel, table=True):
    """ผู้ใช้งานระบบ ระบุตัวตนด้วยชื่อเท่านั้น

    ข้อจำกัดที่ต้องรู้และต้องเขียนไว้ในเล่ม
        นี่ไม่ใช่ระบบยืนยันตัวตนเพื่อความปลอดภัย เพราะไม่มีรหัสผ่าน
        ใครก็พิมพ์ชื่อของคนอื่นแล้วเข้าใช้แทนได้
        จึงห้ามใช้เก็บข้อมูลที่เป็นความลับหรือข้อมูลสุขภาพรายบุคคล

    เหตุผลที่เลือกแบบนี้
        ระบบนี้แสดงข้อมูลคุณภาพอากาศซึ่งเป็นข้อมูลสาธารณะอยู่แล้ว
        การระบุตัวตนมีไว้เพื่อจำค่าที่ผู้ใช้ตั้งไว้ คือจังหวัดและกลุ่มเสี่ยง
        เพื่อแสดงคำแนะนำสุขภาพให้ตรงกับตัวผู้ใช้ ไม่ได้มีไว้ควบคุมสิทธิ์การเข้าถึง
        ถ้าภายหลังต้องเก็บข้อมูลส่วนบุคคล ต้องเปลี่ยนไปใช้รหัสผ่านที่เข้ารหัส
        พร้อมระบบจัดการ session ที่ถูกต้อง
    """

    id: int | None = Field(default=None, primary_key=True)
    display_name: str = Field(index=True, unique=True)

    # ค่าที่ผู้ใช้ตั้งเอง ใช้เลือกคำแนะนำสุขภาพให้ตรงกับสถานการณ์ของแต่ละคน
    province: str | None = None
    risk_group: str | None = None  # อ้างอิง key ใน app.health_advice.RISK_GROUPS

    created_at: datetime = Field(default_factory=_now)
    last_seen_at: datetime = Field(default_factory=_now)


class DiseaseDaily(SQLModel, table=True):
    """จำนวนผู้ป่วยรายวันของกลุ่มโรคที่เกี่ยวข้องกับฝุ่น แยกตามจังหวัด

    ที่มา: ระบบเฝ้าระวังผลกระทบทางสุขภาพจากฝุ่น PM2.5 กรมควบคุมโรค
    เป็นแหล่งปฐมภูมิ ดึงผ่าน API ของ opendata.ddc.moph.go.th ได้โดยตรง

    ข้อกำหนดการใช้งานที่ต้องยึดอย่างเคร่งครัด
        1. ต้นทางเผยแพร่เป็นข้อมูลรายบุคคล มีวันเกิด ตำบล โรงพยาบาล และอาชีพ
           ระบบนี้จะรวมยอดตั้งแต่ขั้นตอนนำเข้า แล้วทิ้งรายละเอียดบุคคลทั้งหมด
           ห้ามบันทึกข้อมูลรายบุคคลลงฐานข้อมูลไม่ว่ากรณีใด
        2. เก็บได้ละเอียดสุดที่ระดับจังหวัด ห้ามลงถึงอำเภอหรือตำบล
           เพราะยิ่งละเอียดยิ่งย้อนกลับไประบุตัวบุคคลได้ง่ายขึ้น
        3. ต้องระบุแหล่งที่มาทุกแถว เพื่อให้ตรวจสอบย้อนกลับได้

    ข้อจำกัดของข้อมูลที่ต้องเขียนไว้ในงาน
        ครอบคลุมเฉพาะเขตสุขภาพที่ 2 คือ พิษณุโลก เพชรบูรณ์ ตาก อุตรดิตถ์ สุโขทัย
        และเป็นข้อมูลปี 2566 ไม่ใช่ข้อมูลปัจจุบัน
    """

    __table_args__ = (
        UniqueConstraint("province", "observed_on", "disease_group", name="uq_disease_day"),
    )

    id: int | None = Field(default=None, primary_key=True)
    province: str = Field(index=True)
    observed_on: date = Field(index=True)
    disease_group: str = Field(index=True)  # เช่น กลุ่มโรคทางเดินหายใจ

    cases: int  # จำนวนครั้งที่เข้ารับบริการ ไม่ใช่จำนวนคนที่ไม่ซ้ำ

    source: str  # ชื่อชุดข้อมูลและหน่วยงานที่เผยแพร่
    imported_at: datetime = Field(default_factory=_now)


class CollectionLog(SQLModel, table=True):
    """บันทึกทุกครั้งที่ระบบดึงข้อมูล

    จำเป็นสำหรับงานวิจัย เพราะต้องรายงานได้ว่าข้อมูลขาดหายช่วงไหนและเพราะอะไร
    ซึ่งเป็นส่วนหนึ่งของการประเมินความครบถ้วนของข้อมูล (completeness)
    """

    id: int | None = Field(default=None, primary_key=True)
    source: str = Field(index=True)  # air4thai หรือ nasa_power
    started_at: datetime = Field(default_factory=_now, index=True)
    finished_at: datetime | None = None
    success: bool = False
    records_new: int = 0
    records_duplicate: int = 0
    stations_seen: int = 0
    error_message: str | None = None
    raw_file: str | None = None  # ที่อยู่ไฟล์ข้อมูลดิบที่เก็บไว้
