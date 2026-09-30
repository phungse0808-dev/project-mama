"""วิเคราะห์ว่าค่าฝุ่นกับจำนวนผู้ป่วยในพื้นที่เดียวกันสัมพันธ์กันหรือไม่

ข้อมูลที่ใช้
    ผู้ป่วยรายเดือน 7 กลุ่มโรค 77 จังหวัด ปี 2565-2568 จากกรมควบคุมโรค (DiseaseMonthly)
    ค่าฝุ่นเฉลี่ยรายเดือนของจังหวัดเดียวกัน จากแบบจำลอง CAMS (Pm25Monthly)

ทำไมต้องคำนวณหลายมุม
    มุมเดียวตอบผิดได้ทั้งสองทาง และผลจริงของข้อมูลชุดนี้พิสูจน์ทั้งสองแบบ

    1. รวมทุกจังหวัด
       จังหวัดใหญ่มีทั้งฝุ่นมากและคนไข้มากอยู่แล้วโดยไม่เกี่ยวกัน ค่าที่ได้จึงสะท้อน
       ขนาดจังหวัด ไม่ใช่ผลของฝุ่น ผลที่ได้คือ 0.00 ซึ่งดูเหมือนไม่มีอะไรเลย

    2. ในจังหวัดเดียวกัน
       แปลงเป็นส่วนต่างจากค่าเฉลี่ยของจังหวัดนั้นเอง ตัดเรื่องขนาดจังหวัดออก
       ผลที่ได้คือติดลบ ซึ่งถ้าอ่านตรง ๆ จะสรุปผิดว่าฝุ่นมากแล้วคนป่วยน้อยลง
       สาเหตุคือฤดู โรคทางเดินหายใจส่วนบนซึ่งเป็นสามในสี่ของผู้ป่วยทั้งหมด
       เป็นโรคติดเชื้อที่มีฤดูของตัวเอง และฤดูนั้นสวนทางกับฤดูฝุ่นพอดี

    3. ตัดฤดูกาลออก
       เทียบเดือนเดียวกันข้ามปี เช่น มีนาคมปีนี้เทียบกับมีนาคมของทุกปีในจังหวัดเดียวกัน
       เหลือคำถามว่า ปีที่เดือนนั้นฝุ่นหนักกว่าปกติ มีคนป่วยมากกว่าปกติไหม
       ผลที่ได้ใกล้ศูนย์ทุกโรค คือค่าลบก้อนใหญ่หายไป แต่ก็ไม่มีค่าบวกโผล่มาแทน

ข้อจำกัดที่ต้องแสดงบนหน้าเว็บทุกครั้ง
    ค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง ไม่ใช่ค่าที่สถานีตรวจวัดได้
    จังหวัดในข้อมูลผู้ป่วยคือจังหวัดของหน่วยบริการ ไม่ใช่ที่อยู่ผู้ป่วย
"""

import json
import statistics
from collections import defaultdict

from sqlmodel import Session, col, func, select

from app.config import DATA_DIR
from app.disease_advice import DISEASES as ADVICE_DISEASES
from app.models import DiseaseAgeSummary, DiseaseMonthly, Pm25Monthly, Reading, Station

# ช่วงค่าฝุ่นที่ใช้แบ่งกลุ่ม ใช้ขอบเดียวกับระดับคุณภาพอากาศของไทยใน app.aqi
BUCKETS = [
    ("ดีมาก", "0–15", 0.0, 15.0),
    ("ดี", "15–25", 15.0, 25.0),
    ("ปานกลาง", "25–37.5", 25.0, 37.5),
    ("เกินมาตรฐาน", "เกิน 37.5", 37.5, float("inf")),
]

# กลุ่มโรคที่ใช้เป็นตัวแทนในกราฟ เพราะเป็นกลุ่มที่คนนึกถึงก่อนเมื่อพูดถึงฝุ่น
MAIN_DISEASE = "โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน"

# โรคเรื้อรังที่งานวิจัยระบุว่าฝุ่นกระตุ้นให้กำเริบโดยตรง ใช้เป็นค่ารวมของหน้า
CHRONIC_DISEASES = ("โรคหอบหืด", "โรคปอดอุดกั้นเรื้อรัง")

# โรคติดต่อในชุดข้อมูล แยกออกมาเพราะไม่ได้ขึ้นกับฝุ่น แต่ขึ้นกับการเปิดเทอมและฤดูฝน
#
# เป็นผู้ป่วยราว 73% ของทั้งหมด ผลของโรคนี้จึงลากภาพรวมไปทั้งก้อน
# ต้องกำกับไว้บนหน้าเว็บ ไม่งั้นคนอ่านจะงงว่าทำไมโรคนี้กลับทางกับอีกหกโรค
INFECTIOUS_DISEASES = ("โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน",)

# ชื่อย่อสำหรับป้ายใต้แท่งกราฟ ชื่อเต็มยาวเกินกว่าจะวางเรียงกันเจ็ดโรคได้
SHORT_NAME_OF = {
    "โรคเยื่อจมูกอักเสบจากภูมิแพ้": "ภูมิแพ้จมูก",
    "โรคเยื่อบุตาอักเสบ": "เยื่อบุตาอักเสบ",
    "โรคหอบหืด": "หอบหืด",
    "โรคผิวหนังอักเสบ": "ผิวหนังอักเสบ",
    "โรคปอดอุดกั้นเรื้อรัง": "ปอดอุดกั้น",
    "โรคลมพิษ": "ลมพิษ",
    "โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน": "ติดเชื้อทางเดินหายใจ",
}

# จับคู่ชื่อโรคในชุดข้อมูลของกรมควบคุมโรค กับชื่อโรคในตารางคำแนะนำของระบบ
#
# สองฝั่งใช้ชื่อไม่ตรงกัน เพราะฝั่งคำแนะนำจัดกลุ่มตามที่ผู้ใช้เลือกได้
# ส่วนฝั่งข้อมูลใช้ชื่อตามรหัสวินิจฉัย จับคู่ไว้เพื่อไม่ต้องเขียนข้อความอาการซ้ำสองที่
ADVICE_NAME_OF = {
    "โรคหอบหืด": "โรคหอบหืด",
    "โรคปอดอุดกั้นเรื้อรัง": "โรคปอดอุดกั้นเรื้อรัง",
    "โรคเยื่อจมูกอักเสบจากภูมิแพ้": "โรคภูมิแพ้",
    "โรคเยื่อบุตาอักเสบ": "กลุ่มโรคตาอักเสบ",
    "โรคผิวหนังอักเสบ": "กลุ่มโรคผิวหนังอักเสบ",
    "โรคลมพิษ": "กลุ่มโรคผิวหนังอักเสบ",
    "โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน": "โรคปอดอักเสบ",
}

# ต้องมีข้อมูลกี่ปีขึ้นไปในเดือนปฏิทินเดียวกัน จึงเอามาเทียบข้ามปีได้
MIN_YEARS_PER_MONTH = 3

# ภาคเหนือตอนบนกับจังหวัดที่ได้รับผลจากการเผาในที่โล่งมากที่สุด
#
# แยกมาดูต่างหากเพราะค่าเฉลี่ยทั้งประเทศกลบพื้นที่นี้จนหมด
# ช่วงเดือนกุมภาพันธ์ถึงเมษายนเป็นฤดูเผา ซึ่งเป็นช่วงที่ฝุ่นสูงที่สุดของภาคนี้
NORTH_PROVINCES = [
    "เชียงใหม่", "เชียงราย", "แม่ฮ่องสอน", "ลำปาง", "ลำพูน",
    "น่าน", "แพร่", "พะเยา", "ตาก", "อุตรดิตถ์",
]
BURN_MONTHS = ("02", "03", "04")

# ไฟล์ค่าฝุ่นรายวันปี 2566 ของห้าจังหวัดภาคเหนือตอนล่าง
#
# เป็นของที่ดึงไว้ตั้งแต่ตอนโปรเจคยังทำห้าจังหวัด เก็บไว้ใช้ต่อเพราะเป็นข้อมูลรายวัน
# ชุดเดียวที่ครอบคลุมฤดูเผาเต็มรอบ ค่ารายเดือนเฉลี่ยยอดแหลมของฤดูเผาหายไปมาก
DAILY_2023_FILE = DATA_DIR / "pm25_2023.json"

# วันหนึ่งต้องมีกี่จังหวัดรายงานขึ้นไป จึงเอาค่าเฉลี่ยทั้งประเทศของวันนั้นมาใช้ได้
#
# วันแรก ๆ ที่ระบบเพิ่งเริ่มเก็บมีไม่กี่จังหวัด ถ้ารวมเข้าไปด้วย
# ค่าเฉลี่ยทั้งประเทศของวันนั้นจะมาจากสองสามจังหวัด ซึ่งไม่ใช่ค่าของทั้งประเทศ
MIN_PROVINCES_PER_DAY = 60

# โรคต้องมีสัดส่วนผู้ป่วยในอย่างน้อยเท่านี้ จึงนำมุมมองความรุนแรงมาแสดงได้
#
# โรคตา ผิวหนัง และภูมิแพ้จมูก มีคนนอนโรงพยาบาลไม่ถึง 0.3% ของผู้ป่วยทั้งหมด
# ฐานเล็กเกินกว่าจะเชื่อถือได้ ตัวเลขแกว่งจนสลับเครื่องหมายไปมาระหว่างระดับฝุ่น
MIN_IPD_SHARE_PCT = 1.0

MONTH_NAMES = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
]

# ข้อจำกัดที่ไม่ได้อยู่ในข้อความที่มาของสองแหล่งอยู่แล้ว จะได้ไม่เขียนซ้ำบนหน้าเว็บ
NOTE_TH = "จังหวัดในข้อมูลผู้ป่วยคือจังหวัดของหน่วยบริการ ไม่ใช่ที่อยู่ผู้ป่วย"


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 4:
        return None
    mean_x, mean_y = statistics.fmean(xs), statistics.fmean(ys)
    top = sum((a - mean_x) * (b - mean_y) for a, b in zip(xs, ys))
    bottom = (
        sum((a - mean_x) ** 2 for a in xs) * sum((b - mean_y) ** 2 for b in ys)
    ) ** 0.5
    return round(top / bottom, 2) if bottom else None


def _load(session: Session):
    pm = {
        (row.province, row.ym): row.pm25
        for row in session.exec(select(Pm25Monthly)).all()
    }
    cases: dict[tuple[str, str, str], int] = {}
    admitted: dict[tuple[str, str, str], int] = {}
    for row in session.exec(select(DiseaseMonthly)).all():
        cases[(row.province, row.ym, row.disease)] = row.persons
        admitted[(row.province, row.ym, row.disease)] = row.ipd or 0
    return pm, cases, admitted


def _pooled(pm, cases, disease: str | None) -> float | None:
    """รวมทุกจังหวัดทุกเดือน ไม่ตัดอะไรเลย"""
    xs, ys = [], []
    for (province, ym), value in pm.items():
        total = _cases_of(cases, province, ym, disease)
        if total is None:
            continue
        xs.append(value)
        ys.append(float(total))
    return _pearson(xs, ys)


def _cases_of(cases, province: str, ym: str, disease: str | None) -> int | None:
    if disease is not None:
        return cases.get((province, ym, disease))
    total = sum(v for (p, m, _), v in cases.items() if p == province and m == ym)
    return total or None


def _within(
    pm,
    cases_by_month,
    disease_index,
    disease: str | None,
    by_season: bool,
    only: set[str] | None = None,
    months: tuple[str, ...] | None = None,
    least: int | None = None,
) -> float | None:
    """เทียบกับค่าปกติของจังหวัดนั้นเอง

    by_season เท็จ  ใช้ค่าเฉลี่ยของทั้งช่วงเป็นค่าปกติ ตัดเรื่องขนาดจังหวัดออก
    by_season จริง  ใช้ค่าเฉลี่ยของเดือนปฏิทินเดียวกันเป็นค่าปกติ ตัดฤดูกาลออกด้วย
    only กับ months  จำกัดให้เหลือเฉพาะบางจังหวัดหรือบางเดือน ใช้ตอนเจาะดูภาคเหนือ
    """
    groups: dict[tuple, list[tuple[float, float]]] = defaultdict(list)
    for (province, ym), value in pm.items():
        if only is not None and province not in only:
            continue
        if months is not None and ym[5:7] not in months:
            continue
        total = (
            disease_index.get((province, ym, disease))
            if disease is not None
            else cases_by_month.get((province, ym))
        )
        if not total:
            continue
        key = (province, ym[5:7]) if by_season else (province,)
        groups[key].append((value, float(total)))

    least = least or (MIN_YEARS_PER_MONTH if by_season else 12)
    xs, ys = [], []
    for series in groups.values():
        if len(series) < least:
            continue
        mean_pm = statistics.fmean(v for v, _ in series)
        mean_case = statistics.fmean(c for _, c in series)
        if mean_case == 0:
            continue
        for value, count in series:
            xs.append(value - mean_pm)
            ys.append((count - mean_case) / mean_case)
    return _pearson(xs, ys)


def _series_of(values: dict[tuple[str, str], float], labels: list[str]) -> dict:
    """จัดค่าที่จับคู่ (จังหวัด, ป้ายเวลา) ให้เป็นชุดข้อมูลพร้อมวาดกราฟ

    ส่งค่าของทุกจังหวัดไปพร้อมกัน เพราะทั้งชุดเล็กพอจะส่งทีเดียวจบ
    และทำให้หน้าเว็บสลับจังหวัดได้ทันทีโดยไม่ต้องเรียกใหม่
    """
    provinces = sorted({province for province, _ in values})
    national = []
    for label in labels:
        found = [values[(p, label)] for p in provinces if (p, label) in values]
        national.append(round(statistics.fmean(found), 1) if found else None)
    return {
        "labels": labels,
        "national": national,
        "provinces": {p: [values.get((p, label)) for label in labels] for p in provinces},
    }


def _station_daily(session: Session) -> dict | None:
    """ค่าเฉลี่ยรายวันจากสถานีตรวจวัดจริง ที่ระบบเก็บเองเข้าไฟล์ CSV

    เป็นค่าที่สถานีวัดได้จริง ไม่ใช่ค่าจากแบบจำลอง จึงใช้ตรวจสอบแบบจำลองได้ด้วย
    ย้อนได้เท่าที่ระบบเริ่มเก็บเท่านั้น จึงต้องมีคู่กับแบบจำลอง ไม่ใช่แทนกัน
    """
    rows = session.exec(
        select(
            func.substr(col(Reading.measured_at), 1, 10),
            Station.province,
            func.avg(Reading.pm25),
        )
        .join(Station, col(Station.id) == col(Reading.station_id))
        .where(col(Reading.pm25).is_not(None))
        .group_by(func.substr(col(Reading.measured_at), 1, 10), col(Station.province))
    ).all()
    if not rows:
        return None

    per_day: dict[str, int] = defaultdict(int)
    values: dict[tuple[str, str], float] = {}
    for day, province, average in rows:
        values[(province, day)] = round(float(average), 1)
        per_day[day] += 1

    days = sorted(day for day, count in per_day.items() if count >= MIN_PROVINCES_PER_DAY)
    if len(days) < 2:
        return None

    keep = {(p, d): v for (p, d), v in values.items() if d in set(days)}
    return {
        "key": "station_daily",
        "label_th": "สถานีตรวจวัดจริง",
        "detail_th": "รายวัน · ค่าที่ระบบเก็บเอง",
        "granularity": "day",
        **_series_of(keep, days),
    }


def _model_daily_2023() -> dict | None:
    """ค่าฝุ่นรายวันปี 2566 ของห้าจังหวัด จากไฟล์ที่เก็บไว้ตั้งแต่ระยะแรกของโปรเจค"""
    if not DAILY_2023_FILE.exists():
        return None
    try:
        raw = json.loads(DAILY_2023_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None
    if not raw:
        return None

    days = sorted({day for series in raw.values() for day in series})
    values = {
        (province, day): round(float(value), 1)
        for province, series in raw.items()
        for day, value in series.items()
    }
    return {
        "key": "model_daily_2023",
        "label_th": "แบบจำลอง รายวัน 2566",
        "detail_th": "รายวัน · เฉพาะ 5 จังหวัดภาคเหนือตอนล่าง",
        "granularity": "day",
        **_series_of(values, days),
    }


def _dust_sources(session: Session, pm, pm_months: list[str]) -> dict:
    """แหล่งค่าฝุ่นย้อนหลังทุกแหล่งที่มี ส่งไปให้หน้าเว็บเลือกดูเอง

    สามแหล่งตอบคนละคำถาม จึงต้องมีครบ ไม่ใช่เลือกอันเดียว
        แบบจำลองรายเดือน  ย้อนได้ไกลที่สุดและครบทุกจังหวัด ใช้ดูภาพรวมข้ามปี
        สถานีจริงรายวัน    เป็นค่าที่วัดได้จริง ใช้ตรวจว่าแบบจำลองตรงแค่ไหน
        แบบจำลองรายวัน 2566 ละเอียดพอจะเห็นยอดแหลมของฤดูเผาที่ค่ารายเดือนกลบไป
    """
    monthly = {
        "key": "model_monthly",
        "label_th": "แบบจำลอง รายเดือน",
        "detail_th": "รายเดือน · ครบทุกจังหวัด ย้อนไกลสุด",
        "granularity": "month",
        **_series_of(pm, pm_months),
    }

    sources = [monthly]
    station = _station_daily(session)
    if station:
        sources.insert(0, station)
    daily_2023 = _model_daily_2023()
    if daily_2023:
        sources.append(daily_2023)

    return {
        "sources": sources,
        "default_key": monthly["key"],
        "thai_standard": 37.5,
        "who_guideline": 15.0,
    }


def _next_month(pm, pm_months: list[str]) -> dict:
    """เอาค่าฝุ่นจริงของเดือนล่าสุด มาบอกว่าเดือนถัดไปน่าจะเป็นอย่างไร

    ไม่ใช่สูตรใหม่ เป็นการนำค่าที่วัดได้จากข้อมูลย้อนหลังมาใช้กับเดือนล่าสุด
    คือดูว่าเดือนล่าสุดจังหวัดนั้นฝุ่นอยู่ระดับไหน แล้วหยิบค่าของระดับนั้นมาตอบ

    ส่งค่าฝุ่นของทุกจังหวัดไปด้วย เพื่อให้หน้าเว็บสลับจังหวัดได้ทันที
    และส่งจำนวนจังหวัดในแต่ละระดับ เพราะถ้าเดือนล่าสุดเป็นหน้าฝนแล้วทุกจังหวัด
    อยู่ระดับดีมากหมด ตัวเลขคาดการณ์จะต่ำทั้งกระดาน ต้องบอกให้เห็นว่าเป็นเพราะอะไร
    """
    latest = pm_months[-1]
    values = {province: value for (province, ym), value in pm.items() if ym == latest}
    if not values:
        return {}

    counts = {label: 0 for label, _, _, _ in BUCKETS}
    for value in values.values():
        for label, _, low, high in BUCKETS:
            if low <= value < high:
                counts[label] += 1
                break

    return {
        "from_ym": latest,
        "to_ym": _next_ym(latest),
        "national_pm25": round(statistics.fmean(values.values()), 1),
        "provinces": {province: round(value, 1) for province, value in sorted(values.items())},
        "level_counts": [
            {"label_th": label, "range_th": range_th, "provinces": counts[label]}
            for label, range_th, _, _ in BUCKETS
        ],
    }


def _next_ym(ym: str) -> str:
    year, month = int(ym[:4]), int(ym[5:])
    return f"{year + (month == 12)}-{(month % 12) + 1:02d}"


def _share_effect(
    pm,
    share,
    step: int,
    control_year: bool = True,
    skip_years: tuple[str, ...] = (),
) -> dict[str, list[float]]:
    """ส่วนต่างจากค่าปกติ แยกตามระดับฝุ่นของเดือนตั้งต้น

    step = 0 เทียบเดือนเดียวกัน · step = 1 เทียบเดือนถัดไป

    ค่าปกติคือค่าเฉลี่ยของจังหวัดนั้นในเดือนปฏิทินเดียวกัน ซึ่งหักทั้งขนาดจังหวัด
    และรูปแบบตามฤดูกาลออกไปพร้อมกัน

    control_year หักค่าเฉลี่ยของปีนั้นออกอีกชั้น
        จำเป็นเพราะสัดส่วนโรคเรื้อรังไต่ขึ้นทุกปี จาก -14.8% ในปี 2565 เป็น +13.3% ในปี 2568
        ปี 2565 ยังอยู่ในช่วงมาตรการโควิดและมีข้อมูลเฉพาะเดือนฝุ่นต่ำ
        ถ้าไม่หักแนวโน้มนี้ออก สิ่งที่วัดได้จะเป็นความต่างระหว่างปี ไม่ใช่ความต่างระหว่างระดับฝุ่น
    """
    usable = {k: v for k, v in share.items() if k[1][:4] not in skip_years}

    grouped = defaultdict(list)
    for (province, ym), value in usable.items():
        grouped[(province, ym[5:])].append(value)
    normal = {
        key: statistics.fmean(values)
        for key, values in grouped.items()
        if len(values) >= MIN_YEARS_PER_MONTH
    }

    deviation = {}
    for (province, ym), value in usable.items():
        base = normal.get((province, ym[5:]))
        if base:
            deviation[(province, ym)] = (value - base) / base * 100

    by_year: dict[str, list[float]] = defaultdict(list)
    for (_, ym), value in deviation.items():
        by_year[ym[:4]].append(value)
    year_mean = {year: statistics.fmean(values) for year, values in by_year.items()}

    rows: dict[str, list[float]] = defaultdict(list)
    for (province, ym), dust in pm.items():
        if ym[:4] in skip_years:
            continue
        target_ym = _next_ym(ym) if step else ym
        value = deviation.get((province, target_ym))
        if value is None:
            continue
        if control_year:
            value -= year_mean.get(target_ym[:4], 0.0)
        for label, _, low, high in BUCKETS:
            if low <= dust < high:
                rows[label].append(value)
                break
    return rows


def _buckets_of(rows: dict[str, list[float]]) -> list[dict]:
    return [
        {
            "label_th": label,
            "range_th": range_th,
            "months": len(rows[label]),
            "change_pct": round(statistics.fmean(rows[label]), 1),
            "median_pct": round(statistics.median(rows[label]), 1),
        }
        for label, range_th, _, _ in BUCKETS
        if rows[label]
    ]


def _robustness(pm, chronic_share) -> dict:
    """ผลเปลี่ยนไปแค่ไหนเมื่อจัดการปี 2565 ด้วยวิธีต่างกัน

    ต้องแสดงคู่กับผลหลักเสมอ เพราะขนาดของผลขึ้นกับวิธีจัดการปีนั้นมาก
    ถ้ารายงานตัวเลขเดียวโดยไม่บอกช่วง ผู้อ่านที่ลองวิธีอื่นจะได้คำตอบต่างกันหลายเท่า
    """
    variants = [
        ("ไม่คุมอะไร", dict(control_year=False)),
        ("คุมแนวโน้มรายปี", dict(control_year=True)),
        ("ตัดปี 2565 ออก", dict(control_year=False, skip_years=("2022",))),
        ("ตัดปี 2565 และคุมปี", dict(control_year=True, skip_years=("2022",))),
    ]
    rows = []
    for label, options in variants:
        buckets = _buckets_of(_share_effect(pm, chronic_share, step=1, **options))
        if buckets:
            rows.append({
                "label_th": label,
                "current": options.get("control_year", False) and not options.get("skip_years"),
                "buckets": buckets,
            })

    highest = [row["buckets"][-1]["change_pct"] for row in rows]
    return {
        "rows": rows,
        "range_th": f"{min(highest):+.1f}% ถึง {max(highest):+.1f}%",
        "note_th": (
            "ทุกวิธีให้ค่าเป็นบวกที่ระดับเกินมาตรฐาน และสูงกว่าเดือนที่อากาศดีเสมอ "
            "ทิศทางจึงคงที่ แต่ขนาดของผลต่างกันหลายเท่าตามวิธีจัดการปี 2565 "
            "จึงสรุปขนาดเป็นตัวเลขเดียวจากข้อมูลชุดนี้ไม่ได้"
        ),
        "why_th": (
            "ปี 2565 ยังอยู่ในช่วงมาตรการโควิด สัดส่วนโรคเรื้อรังต่ำกว่าค่าปกติ 14.8% "
            "และมีข้อมูลเพียงเดือนสิงหาคมถึงธันวาคม ซึ่งเป็นเดือนที่ฝุ่นต่ำทั้งหมด "
            "จึงดึงค่าปกติของเดือนฝุ่นต่ำลง ทำให้เดือนฝุ่นสูงของปีอื่นดูสูงกว่าปกติ"
        ),
    }


def _lagged(pm, cases, admitted, age_top_of: dict) -> dict:
    """ฝุ่นเดือนหนึ่ง กับสัดส่วนผู้ป่วยของเดือนเดียวกันและเดือนถัดไป

    ทำไมต้องใช้สัดส่วน ไม่ใช่จำนวนผู้ป่วย
        จำนวนผู้ป่วยรวมขึ้นกับว่าเดือนนั้นคนไปโรงพยาบาลมากหรือน้อย
        เดือนที่ฝุ่นสูงที่สุดคือมีนาคมถึงเมษายน ซึ่งตรงกับปิดเทอมและสงกรานต์พอดี
        จำนวนผู้ป่วยรวมจึงตกทุกปีด้วยเหตุผลที่ไม่เกี่ยวกับฝุ่นเลย
        เมื่อวัดด้วยจำนวนรวม ผลจึงออกมาว่าฝุ่นมากแล้วผู้ป่วยน้อยลง ซึ่งเป็นภาพลวง
        สัดส่วนตัดเรื่องนี้ออกได้ เพราะทั้งตัวตั้งและตัวหารได้รับผลเท่ากัน

    ทำไมต้องแยกรายโรค
        ทำครบทุกโรค ไม่ได้เลือกเฉพาะโรคที่ผลออกมาดี ผลที่ได้คือโรคแยกตัวเอง
        เป็นสองกลุ่ม โรคที่ฝุ่นกระตุ้นหกโรคขึ้นพร้อมกัน ส่วนโรคติดต่อลง
        การแยกตัวตามธรรมชาติของโรคเป็นหลักฐานที่หนักแน่นกว่าการเลือกโรคมาวิเคราะห์เอง
    """
    totals: dict[tuple[str, str], int] = defaultdict(int)
    per_disease: dict[str, dict[tuple[str, str], int]] = defaultdict(dict)
    per_admitted: dict[str, dict[tuple[str, str], int]] = defaultdict(dict)
    grand: dict[str, int] = defaultdict(int)
    grand_admitted: dict[str, int] = defaultdict(int)
    for (province, ym, disease), value in cases.items():
        totals[(province, ym)] += value
        per_disease[disease][(province, ym)] = value
        grand[disease] += value
        stay = admitted.get((province, ym, disease), 0)
        per_admitted[disease][(province, ym)] = stay
        grand_admitted[disease] += stay

    def share_of(members, table_of=None) -> dict:
        """สัดส่วนของกลุ่มโรคที่เลือก ต่อผู้ป่วยทุกโรคในเดือนนั้น

        ตัวหารเป็นผู้ป่วยทั้งหมดเสมอ แม้ตอนนับเฉพาะผู้ป่วยใน
        เพื่อให้สองมุมมองใช้ฐานเดียวกันและเทียบกันได้ตรง ๆ
        """
        source = table_of or per_disease
        picked = [source[name] for name in members if name in source]
        out = {}
        for key, total in totals.items():
            if total:
                out[key] = sum(table.get(key, 0) for table in picked) / total * 100
        return out

    advice_of = {item["name"]: item for item in ADVICE_DISEASES}

    by_disease = []
    for disease in sorted(per_disease, key=lambda name: -grand[name]):
        rows = _share_effect(pm, share_of([disease]), step=1)
        buckets = _buckets_of(rows)
        if not buckets:
            continue
        # มุมมองความรุนแรง นับเฉพาะคนที่อาการหนักพอต้องนอนโรงพยาบาล
        #
        # ตอบคำถามที่มุมมองแรกตอบไม่ได้ คือฝุ่นทำให้คนมาหาหมอมากขึ้นเฉย ๆ
        # หรือทำให้คนที่อาการหนักเพิ่มขึ้นด้วย
        ipd_share = grand_admitted[disease] / grand[disease] * 100 if grand[disease] else 0.0
        ipd_buckets = _buckets_of(_share_effect(pm, share_of([disease], per_admitted), step=1))

        advice = advice_of.get(ADVICE_NAME_OF.get(disease, ""), {})
        age = age_top_of.get(disease, {})
        by_disease.append({
            "disease": disease,
            "short_th": SHORT_NAME_OF.get(disease, disease),
            "total": grand[disease],
            "age_group": age.get("age_group"),
            "age_share_pct": age.get("share_pct"),
            "infectious": disease in INFECTIOUS_DISEASES,
            "early_th": advice.get("early"),
            "warning_th": advice.get("warning"),
            "buckets": buckets,
            "admitted": grand_admitted[disease],
            "ipd_share_pct": round(ipd_share, 2),
            # ฐานใหญ่พอจะเชื่อตัวเลขความรุนแรงได้หรือไม่
            "ipd_reliable": ipd_share >= MIN_IPD_SHARE_PCT,
            "ipd_buckets": ipd_buckets,
        })

    chronic = share_of(CHRONIC_DISEASES)
    robustness = _robustness(pm, chronic)
    targets = [
        {
            "key": key,
            "label_th": label,
            "buckets": _buckets_of(_share_effect(pm, chronic, step=step)),
        }
        for key, label, step in (("same", "เดือนเดียวกัน", 0), ("next", "เดือนถัดไป", 1))
    ]

    return {
        "disease_th": "โรคหอบหืดและโรคปอดอุดกั้นเรื้อรัง",
        "measure_th": "สัดส่วนผู้ป่วยโรคนั้น ต่อผู้ป่วยทุกโรคในเดือนนั้น",
        "control_th": "หักค่าปกติของจังหวัดในเดือนปฏิทินเดียวกัน และหักแนวโน้มรายปีออกแล้ว",
        "measure_ipd_th": "สัดส่วนผู้ป่วยโรคนั้นที่ต้องนอนโรงพยาบาล ต่อผู้ป่วยทุกโรคในเดือนนั้น",
        "ipd_note_th": (
            "แสดงเฉพาะโรคที่มีสัดส่วนผู้ป่วยในอย่างน้อย 1% ของผู้ป่วยโรคนั้น "
            "โรคตา ผิวหนัง และภูมิแพ้จมูก มีคนนอนโรงพยาบาลไม่ถึง 0.3% "
            "ฐานเล็กเกินกว่าจะเชื่อถือได้ จึงไม่นำมาแสดงในมุมมองนี้"
        ),
        "targets": targets,
        "by_disease": by_disease,
        "robustness": robustness,
        "infectious_note_th": (
            "โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลันให้ผลกลับทางกับอีกหกโรค "
            "เพราะเป็นโรคติดต่อที่ขึ้นกับการเปิดเทอมและฤดูฝน ไม่ได้ขึ้นกับฝุ่น "
            "และเป็นผู้ป่วยราว 73% ของทั้งหมด จึงลากภาพรวมให้ติดลบ"
        ),
        # สิ่งที่ลองแล้วไม่ได้ผล ต้องแสดงคู่กันเสมอ
        #
        # ถ้าโชว์แต่แบบที่ได้ผล คนอ่านจะไม่รู้ว่าผู้จัดทำลองมากี่แบบกว่าจะเจอ
        # ซึ่งเป็นข้อมูลที่จำเป็นต่อการตัดสินว่าผลนี้น่าเชื่อแค่ไหน
        "tried_th": [
            "จำนวนผู้ป่วยรวมทุกโรค ได้ผลกลับทาง เดือนฝุ่นสูงมีผู้ป่วยเดือนถัดไปน้อยกว่าปกติ 6.8%",
            "ค่าสหสัมพันธ์ของสัดส่วนรายโรคทีละโรค อยู่ระหว่าง −0.08 ถึง +0.08 ทุกโรค "
            "ผลที่เห็นจึงมาจากการแบ่งกลุ่มตามระดับฝุ่น ไม่ใช่จากความสัมพันธ์แบบเส้นตรง",
        ],
        "caveat_th": (
            "ตัวเลขนี้บอกว่าส่วนผสมของผู้ป่วยเปลี่ยนไป ไม่ได้บอกว่ามีคนป่วยเพิ่มขึ้นกี่คน "
            "ระดับปานกลางกับเกินมาตรฐานให้ผลใกล้เคียงกัน แปลว่าเมื่อเกิน 25 ไปแล้ว "
            "ไม่ได้แย่ลงตามปริมาณฝุ่นอีก และค่าฝุ่นย้อนหลังมาจากแบบจำลองซึ่งประเมิน "
            "ฝุ่นภาคเหนือช่วงฤดูเผาต่ำกว่าความจริง"
        ),
    }


_cache: dict | None = None
_cache_stamp: tuple | None = None


def _stamp(session: Session) -> tuple:
    """ลายเซ็นของข้อมูลที่ผลลัพธ์ชุดนี้ขึ้นอยู่กับ

    ใช้ค่าที่อ่านเร็วอย่างเวลาล่าสุดกับจำนวนแถว ไม่ใช่การคำนวณจริง
    ถ้าลายเซ็นเปลี่ยนแปลว่ามีข้อมูลใหม่เข้ามา ต้องคำนวณใหม่

    ต้องมี Reading อยู่ในนี้ด้วย เพราะกราฟค่าฝุ่นรายวันจากสถานีอ่านจากตารางนี้
    ซึ่งตัวเก็บข้อมูลเขียนเพิ่มทุกชั่วโมง ไม่ใช่ข้อมูลนิ่งเหมือนข้อมูลผู้ป่วย
    """
    return (
        session.exec(select(func.max(col(Reading.measured_at)))).one(),
        session.exec(select(func.count()).select_from(Reading)).one(),
        session.exec(select(func.max(col(Pm25Monthly.ym)))).one(),
        session.exec(select(func.count()).select_from(DiseaseMonthly)).one(),
    )


def dust_cases(session: Session) -> dict:
    """ข้อมูลทั้งหมดของหน้าฝุ่นกับผู้ป่วย

    คำนวณครั้งแรกใช้เวลาราวยี่สิบวินาทีเพราะต้องไล่ข้อมูลสามหมื่นแถวหลายรอบ
    ผลจึงเก็บไว้ในหน่วยความจำ แล้วคำนวณใหม่เมื่อข้อมูลต้นทางเปลี่ยน

    ห้ามเก็บไว้ถาวรโดยไม่ตรวจสอบ เพราะค่าฝุ่นรายวันจากสถานีในผลลัพธ์นี้
    มาจากตาราง Reading ที่มีข้อมูลเพิ่มทุกชั่วโมง ถ้าไม่ตรวจ หน้าเว็บจะค้าง
    อยู่ที่ข้อมูลของตอนที่เซิร์ฟเวอร์เริ่มทำงาน โดยไม่มีอาการอะไรให้สังเกต
    """
    global _cache, _cache_stamp
    stamp = _stamp(session)
    if _cache is not None and _cache_stamp == stamp:
        return _cache
    _cache = _compute(session)
    _cache_stamp = stamp
    return _cache


def _compute(session: Session) -> dict:
    pm, cases, admitted = _load(session)
    if not pm or not cases:
        return {"available": False, "reason": "ยังไม่มีข้อมูลผู้ป่วยหรือค่าฝุ่นย้อนหลัง"}

    diseases = sorted({d for _, _, d in cases})
    provinces = sorted({p for p, _ in pm})

    # เดือนที่ใช้วิเคราะห์ได้จริงคือเดือนที่มีทั้งค่าฝุ่นและข้อมูลผู้ป่วย
    #
    # ค่าฝุ่นยาวกว่าข้อมูลผู้ป่วย เพราะดึงจากแบบจำลองได้ถึงเดือนปัจจุบัน
    # ส่วนข้อมูลผู้ป่วยได้มาเป็นชุด ต้องขอใหม่จึงจะมีของปีล่าสุด
    # ถ้ารายงานช่วงของค่าฝุ่นอย่างเดียว คนอ่านจะเข้าใจว่าวิเคราะห์ครบถึงเดือนล่าสุด
    pm_months = sorted({m for _, m in pm})
    case_months = sorted({m for _, m, _ in cases})
    months = [m for m in pm_months if m in set(case_months)]

    cases_by_month: dict[tuple[str, str], int] = defaultdict(int)
    for (province, ym, _), value in cases.items():
        cases_by_month[(province, ym)] += value

    # ผู้ป่วยเฉลี่ยต่อจังหวัดต่อเดือน แยกตามระดับฝุ่นของเดือนนั้น
    buckets = []
    for label, range_th, low, high in BUCKETS:
        counts = [
            cases.get((province, ym, MAIN_DISEASE), 0)
            for (province, ym), value in pm.items()
            if low <= value < high and (province, ym, MAIN_DISEASE) in cases
        ]
        buckets.append(
            {
                "label_th": label,
                "range_th": range_th,
                "months": len(counts),
                "cases_per_month": round(statistics.fmean(counts)) if counts else 0,
            }
        )

    correlations = [
        {
            "group": disease or "รวมทุกโรค",
            "pooled": _pooled(pm, cases, disease),
            "within": _within(pm, cases_by_month, cases, disease, by_season=False),
            "deseasonal": _within(pm, cases_by_month, cases, disease, by_season=True),
        }
        for disease in diseases + [None]
    ]

    # รูปแบบตามเดือนปฏิทิน ใช้อธิบายว่าทำไมค่าที่ยังไม่ตัดฤดูกาลถึงติดลบ
    dust_by_month: dict[str, list[float]] = defaultdict(list)
    cases_year_month: dict[tuple[str, str], int] = defaultdict(int)
    for (province, ym), value in pm.items():
        dust_by_month[ym[5:7]].append(value)
        cases_year_month[(ym[:4], ym[5:7])] += cases.get((province, ym, MAIN_DISEASE), 0)

    cases_month: dict[str, list[int]] = defaultdict(list)
    for (_, month), total in cases_year_month.items():
        cases_month[month].append(total)

    seasonal = [
        {
            "month_th": MONTH_NAMES[int(m) - 1],
            "pm25": round(statistics.fmean(dust_by_month[m]), 1),
            # เฉลี่ยต่อปี เพราะบางเดือนมีข้อมูล 4 ปี บางเดือนมี 3 ปี
            "cases": round(statistics.fmean(cases_month[m])),
            "years": len(cases_month[m]),
        }
        for m in sorted(dust_by_month)
    ]

    # ช่วงอายุที่พบผู้ป่วยมากที่สุดของแต่ละโรค
    ages: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for row in session.exec(select(DiseaseAgeSummary)).all():
        ages[row.disease][row.age_group] += row.persons
    age_top = []
    for disease, groups in ages.items():
        total = sum(groups.values())
        if not total:
            continue
        group, count = max(groups.items(), key=lambda kv: kv[1])
        age_top.append(
            {
                "disease": disease,
                "age_group": group,
                "persons": count,
                "share_pct": round(count / total * 100, 1),
                "total": total,
            }
        )
    age_top.sort(key=lambda item: -item["share_pct"])

    # ภาคเหนือช่วงเผา แยกมาดูต่างหาก
    north_all = {}
    north_burn = {}
    for disease in diseases + [None]:
        name = disease or "รวมทุกโรค"
        north_all[name] = _within(
            pm, cases_by_month, cases, disease, by_season=False, only=set(NORTH_PROVINCES)
        )
        north_burn[name] = _within(
            pm, cases_by_month, cases, disease, by_season=False,
            only=set(NORTH_PROVINCES), months=BURN_MONTHS, least=4,
        )

    north_values = [v for (province, _), v in pm.items() if province in NORTH_PROVINCES]
    burn_values = [
        v for (province, ym), v in pm.items()
        if province in NORTH_PROVINCES and ym[5:7] in BURN_MONTHS
    ]
    all_values = list(pm.values())

    focus = {
        "name_th": "ภาคเหนือช่วงเผา",
        "provinces": NORTH_PROVINCES,
        "months_th": "กุมภาพันธ์ ถึง เมษายน",
        "pm25_north": round(statistics.fmean(north_values), 1) if north_values else 0,
        "pm25_north_burn": round(statistics.fmean(burn_values), 1) if burn_values else 0,
        "pm25_north_max": round(max(north_values), 1) if north_values else 0,
        "pm25_country": round(statistics.fmean(all_values), 1) if all_values else 0,
        "pm25_country_max": round(max(all_values), 1) if all_values else 0,
        "rows": [
            {"group": name, "all_year": north_all[name], "burning": north_burn[name]}
            for name in north_all
        ],
        # ข้อจำกัดที่ต้องบอกคู่กับผลเสมอ ไม่งั้นคนอ่านจะเข้าใจว่าภาคเหนือฝุ่นน้อยกว่าที่อื่น
        "caveat_th": (
            "ค่าฝุ่นย้อนหลังที่ใช้มาจากแบบจำลองระดับโลก ซึ่งประเมินฝุ่นจากการเผา "
            "ในภาคเหนือต่ำกว่าความจริงมาก ค่าเฉลี่ยของภาคเหนือจึงออกมาต่ำกว่าค่าเฉลี่ย "
            "ทั้งประเทศ ทั้งที่พื้นที่นี้มีปัญหาฝุ่นรุนแรงที่สุด ผลในตารางนี้จึงอ่อนกว่าความจริง"
        ),
    }

    return {
        "available": True,
        "focus": focus,
        "provinces": len(provinces),
        "months": len(months),
        "start": months[0],
        "end": months[-1],
        # ช่วงของค่าฝุ่นที่มี ยาวกว่าช่วงที่วิเคราะห์ได้ ใช้บอกว่าข้อมูลผู้ป่วยตามไม่ทัน
        "pm_end": pm_months[-1],
        "case_end": case_months[-1],
        "pairs": sum(1 for key in pm if key in cases_by_month),
        "total_cases": sum(cases.values()),
        "main_disease": MAIN_DISEASE,
        "buckets": buckets,
        "correlations": correlations,
        "dust_series": _dust_sources(session, pm, pm_months),
        "lagged": _lagged(pm, cases, admitted, {row["disease"]: row for row in age_top}),
        "next_month": _next_month(pm, pm_months),
        "seasonal": seasonal,
        "age_top": age_top,
        "note_th": NOTE_TH,
        "disease_source_th": next(iter(session.exec(select(DiseaseMonthly.source)).all()), ""),
        "pm25_source_th": next(iter(session.exec(select(Pm25Monthly.source)).all()), ""),
    }
