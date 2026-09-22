"""วิเคราะห์ว่าค่าฝุ่นกับจำนวนผู้ป่วยในพื้นที่เดียวกันสัมพันธ์กันหรือไม่

ทำไมต้องมีโมดูลนี้
    ระบบมีข้อมูลผู้ป่วยจริง 4 กลุ่มโรคของปี 2566 อยู่แล้ว แต่เดิมไม่ได้เอามาแสดงเลย
    คำถามที่คนดูอยากรู้คือ ฝุ่นมากแล้วคนป่วยมากขึ้นจริงไหม โมดูลนี้ตอบคำถามนั้น
    ด้วยการคำนวณสดจากฐานข้อมูล ไม่ใช่ตัวเลขที่พิมพ์ฝังไว้

กับดักที่ต้องข้ามก่อน
    จำนวนผู้ป่วยนับจากวันที่เข้ารับบริการ ไม่ใช่วันที่เริ่มมีอาการ วันที่สถานพยาบาลปิด
    จึงมีผู้ป่วยน้อยโดยไม่เกี่ยวกับฝุ่น ถ้าไม่ตัดเสาร์อาทิตย์และวันหยุดราชการออกก่อน
    จะได้ค่าสหสัมพันธ์รายเดือนติดลบมาก แล้วแปลผิดว่าฝุ่นมากทำให้ป่วยน้อยลง
    หน้าเว็บจึงแสดงทั้งค่าก่อนตัดและหลังตัด เพื่อให้เห็นว่าตัวแปรแฝงมีผลแค่ไหน

ค่าฝุ่นปี 2566 มาจากไหน
    ระบบต้นทางไม่เปิดข้อมูลย้อนหลัง และระบบนี้เพิ่งเริ่มเก็บค่าจริงกลางปี 2569
    ค่าฝุ่นปี 2566 จึงมาจากคลังข้อมูลของ Open-Meteo ซึ่งเป็นผลของแบบจำลอง CAMS
    ไม่ใช่ค่าที่สถานีวัดได้ หน้าเว็บต้องเขียนกำกับไว้ทุกครั้ง
"""

import datetime
import json
import statistics
from pathlib import Path

from sqlmodel import Session, select

from app.models import DiseaseDaily

# ค่าฝุ่นรายวันปี 2566 ที่ดึงไว้แล้ว สร้างใหม่ได้ด้วย scripts/analyze_dust_cases.py
PM25_FILE = Path(__file__).resolve().parent.parent / "data" / "pm25_2023.json"

# วันหยุดราชการปี 2566 ในช่วงที่มีข้อมูล ตัดออกพร้อมเสาร์อาทิตย์
HOLIDAYS = {
    "2023-01-02", "2023-03-06", "2023-04-06", "2023-04-13", "2023-04-14",
    "2023-04-15", "2023-04-17", "2023-05-01", "2023-05-04", "2023-05-05",
    "2023-06-03", "2023-06-05", "2023-07-28", "2023-08-01", "2023-08-02",
    "2023-08-14",
}

# ช่วงค่าฝุ่นที่ใช้แบ่งกลุ่ม ใช้ขอบเดียวกับระดับคุณภาพอากาศของไทยใน app.aqi
BUCKETS = [
    ("ดีมาก", "0–15", 0.0, 15.0),
    ("ดี", "15–25", 15.0, 25.0),
    ("ปานกลาง", "25–37.5", 25.0, 37.5),
    ("เกินมาตรฐาน", "เกิน 37.5", 37.5, float("inf")),
]

# กลุ่มโรคที่ใช้เป็นตัวแทนในกราฟแท่ง เพราะเป็นกลุ่มที่ฝุ่นน่าจะมีผลมากที่สุด
MAIN_GROUP = "กลุ่มโรคทางเดินหายใจ"

SOURCE_TH = "กรมควบคุมโรค กระทรวงสาธารณสุข"
SOURCE_DETAIL_TH = "ระบบเฝ้าระวังผลกระทบทางสุขภาพจากฝุ่น PM2.5 เผยแพร่เป็นข้อมูลเปิดของภาครัฐ"
SOURCE_URL = "https://opendata.ddc.moph.go.th/"
SOURCE_NOTE_TH = "ระบบนำเข้าเองผ่าน API และรวมยอดตั้งแต่ขั้นนำเข้า เก็บแค่จังหวัด วันที่ กลุ่มโรค และจำนวน ไม่มีข้อมูลรายบุคคล"

PM25_SOURCE_TH = "แบบจำลอง CAMS ของ Copernicus ผ่านคลังข้อมูล Open-Meteo"
PM25_SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api"
PM25_NOTE_TH = (
    "ไม่ใช่ค่าที่สถานีตรวจวัดได้ เพราะระบบต้นทางไม่เปิดข้อมูลย้อนหลัง "
    "และระบบนี้เพิ่งเริ่มเก็บค่าจริงเมื่อกลางปี 2569 ใช้ดูแนวโน้มได้ แต่ไม่ใช่ค่าตรวจวัดของพื้นที่"
)

_pm25_cache: dict[str, dict[str, float]] | None = None


def _pm25() -> dict[str, dict[str, float]]:
    """ค่าฝุ่นเฉลี่ยรายวันแยกรายจังหวัด อ่านจากไฟล์ครั้งเดียวแล้วเก็บไว้ในหน่วยความจำ"""
    global _pm25_cache
    if _pm25_cache is None:
        _pm25_cache = (
            json.loads(PM25_FILE.read_text(encoding="utf-8")) if PM25_FILE.exists() else {}
        )
    return _pm25_cache


def _is_workday(day_text: str) -> bool:
    return datetime.date.fromisoformat(day_text).weekday() < 5 and day_text not in HOLIDAYS


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """ค่าสหสัมพันธ์แบบเพียร์สัน คืน None เมื่อข้อมูลน้อยเกินไปหรือไม่มีการกระจาย"""
    if len(xs) < 3:
        return None
    mean_x, mean_y = statistics.fmean(xs), statistics.fmean(ys)
    top = sum((a - mean_x) * (b - mean_y) for a, b in zip(xs, ys))
    bottom = (
        sum((a - mean_x) ** 2 for a in xs) * sum((b - mean_y) ** 2 for b in ys)
    ) ** 0.5
    return round(top / bottom, 2) if bottom else None


def _imported_at(session: Session) -> str | None:
    """วันที่ระบบนำเข้าข้อมูลผู้ป่วยครั้งล่าสุด ใช้บอกว่าตัวเลขบนหน้าเว็บเก่าแค่ไหน"""
    stamps = [row.imported_at for row in session.exec(select(DiseaseDaily)).all() if row.imported_at]
    return max(stamps).isoformat(timespec="seconds") if stamps else None


def _rows(session: Session) -> list[tuple[str, str, str, int]]:
    return [
        (row.province, row.observed_on.isoformat(), row.disease_group, row.cases)
        for row in session.exec(select(DiseaseDaily)).all()
    ]


def _pairs(rows, pm25, group: str | None, mode: str) -> dict[tuple, list[float]]:
    """จับคู่ค่าฝุ่นกับจำนวนผู้ป่วยตามวิธีที่เลือก คีย์คือหน่วยที่นับเป็นหนึ่งคู่

    mode: all = ทุกวัน, workday = เฉพาะวันทำการ, weekly = รวมรายสัปดาห์ของวันทำการ
    """
    bag: dict[tuple, list[float]] = {}
    for province, day_text, disease, cases in rows:
        if group and disease != group:
            continue
        if mode != "all" and not _is_workday(day_text):
            continue
        value = pm25.get(province, {}).get(day_text)
        if value is None:
            continue
        if mode == "weekly":
            key = (province, datetime.date.fromisoformat(day_text).isocalendar()[:2])
        else:
            key = (province, day_text)
        slot = bag.setdefault(key, [0.0, 0, 0])
        slot[0] += value
        slot[1] += 1
        slot[2] += cases
    return bag


def _correlation(rows, pm25, group: str | None, mode: str) -> float | None:
    bag = _pairs(rows, pm25, group, mode)
    return _pearson([s[0] / s[1] for s in bag.values()], [s[2] for s in bag.values()])


def _example(rows, pm25) -> dict | None:
    """ตัวอย่างคำนวณจริงห้าวัน ให้คนอ่านไล่ตามสูตรด้วยมือได้

    เลือกช่วงที่ฝุ่นสูงที่สุด เพราะเป็นช่วงที่คนคาดว่าจะเห็นผลชัดที่สุด
    ตัวอย่างนี้มักได้ค่าสูงกว่าค่ารวมทั้งชุดมาก ซึ่งเป็นประเด็นที่ต้องอธิบายต่อว่า
    หยิบมาไม่กี่วันแล้วสรุปไม่ได้ ต้องดูทั้งชุด
    """
    by_day: dict[tuple[str, str], int] = {}
    for province, day_text, disease, cases in rows:
        if disease == MAIN_GROUP and _is_workday(day_text):
            by_day[(province, day_text)] = cases

    best: tuple[float, str, list[str]] | None = None
    for province in {province for province, _ in by_day}:
        days = sorted(day for prov, day in by_day if prov == province)
        for start in range(len(days) - 4):
            window = days[start : start + 5]
            values = [pm25.get(province, {}).get(day) for day in window]
            if any(value is None for value in values):
                continue
            mean = statistics.fmean(value for value in values if value is not None)
            if best is None or mean > best[0]:
                best = (mean, province, window)

    if best is None:
        return None

    _, province, window = best
    points = [
        {"day": day, "pm25": round(pm25[province][day], 1), "cases": by_day[(province, day)]}
        for day in window
    ]
    xs = [point["pm25"] for point in points]
    ys = [float(point["cases"]) for point in points]
    mean_x, mean_y = statistics.fmean(xs), statistics.fmean(ys)
    top = sum((a - mean_x) * (b - mean_y) for a, b in zip(xs, ys))
    bottom = (
        sum((a - mean_x) ** 2 for a in xs) * sum((b - mean_y) ** 2 for b in ys)
    ) ** 0.5
    return {
        "province": province,
        "group": MAIN_GROUP,
        "points": points,
        "mean_pm25": round(mean_x, 1),
        "mean_cases": round(mean_y, 1),
        "top": round(top, 1),
        "bottom": round(bottom, 1),
        "r": round(top / bottom, 2) if bottom else None,
    }


def _monthly_correlation(rows, pm25) -> float | None:
    """ค่าที่ได้ถ้าดูรายเดือนโดยไม่ตัดวันหยุด ใช้แสดงว่าตัวแปรแฝงทำให้ผลเพี้ยนแค่ไหน"""
    dust: dict[str, list[float]] = {}
    for days in pm25.values():
        for day_text, value in days.items():
            dust.setdefault(day_text[:7], []).append(value)
    cases: dict[str, int] = {}
    for _, day_text, _, count in rows:
        cases[day_text[:7]] = cases.get(day_text[:7], 0) + count
    months = sorted(set(dust) & set(cases))
    return _pearson(
        [statistics.fmean(dust[month]) for month in months],
        [float(cases[month]) for month in months],
    )


def dust_cases(session: Session) -> dict:
    """ข้อมูลทั้งหมดของแผงฝุ่นกับจำนวนผู้ป่วย คำนวณสดทุกครั้งที่เรียก"""
    rows = _rows(session)
    pm25 = _pm25()
    if not rows or not pm25:
        return {"available": False, "reason": "ยังไม่มีข้อมูลผู้ป่วยหรือค่าฝุ่นย้อนหลัง"}

    provinces = sorted({province for province, _, _, _ in rows})
    groups = sorted({group for _, _, group, _ in rows})
    days = sorted({day_text for _, day_text, _, _ in rows})

    # ผู้ป่วยเฉลี่ยต่อวัน แยกวันทำการกับวันหยุด ใช้อธิบายว่าทำไมต้องตัดวันหยุด
    per_day: dict[str, int] = {}
    for _, day_text, _, count in rows:
        per_day[day_text] = per_day.get(day_text, 0) + count
    workday = [count for day_text, count in per_day.items() if _is_workday(day_text)]
    holiday = [count for day_text, count in per_day.items() if not _is_workday(day_text)]

    # ผู้ป่วยเฉลี่ยต่อวันทำการ แยกตามระดับฝุ่นของวันนั้น
    buckets = []
    for label, range_th, low, high in BUCKETS:
        counts: list[int] = []
        seen: set[tuple[str, str]] = set()
        for province, day_text, disease, cases in rows:
            if disease != MAIN_GROUP or not _is_workday(day_text):
                continue
            value = pm25.get(province, {}).get(day_text)
            if value is None or not low <= value < high:
                continue
            counts.append(cases)
            seen.add((province, day_text))
        buckets.append(
            {
                "label_th": label,
                "range_th": range_th,
                "days": len(seen),
                "cases_per_day": round(statistics.fmean(counts)) if counts else 0,
            }
        )

    correlations = [
        {
            "group": group or "รวมทุกกลุ่ม",
            "all_days": _correlation(rows, pm25, group, "all"),
            "workday": _correlation(rows, pm25, group, "workday"),
            "weekly": _correlation(rows, pm25, group, "weekly"),
        }
        for group in groups + [None]
    ]

    # สัดส่วนวันที่ฝุ่นเกินมาตรฐาน ใช้อธิบายว่าทำไมยังไม่เห็นผลของฝุ่น
    values = [value for days_of in pm25.values() for value in days_of.values()]
    over = sum(1 for value in values if value > 37.5)

    return {
        "available": True,
        "provinces": provinces,
        "start": days[0],
        "end": days[-1],
        "total_cases": sum(count for _, _, _, count in rows),
        "main_group": MAIN_GROUP,
        "buckets": buckets,
        "correlations": correlations,
        "workday_cases": round(statistics.fmean(workday)) if workday else 0,
        "holiday_cases": round(statistics.fmean(holiday)) if holiday else 0,
        "monthly_correlation": _monthly_correlation(rows, pm25),
        "workday_correlation": _correlation(rows, pm25, None, "workday"),
        "over_standard_days": over,
        "total_days": len(values),
        "method": {
            "formula": "r = Σ(ฝุ่น − ฝุ่นเฉลี่ย)(ผู้ป่วย − ผู้ป่วยเฉลี่ย) ÷ √[ Σ(ฝุ่น − ฝุ่นเฉลี่ย)² × Σ(ผู้ป่วย − ผู้ป่วยเฉลี่ย)² ]",
            "pairs": [
                {
                    "label_th": "ทุกวัน",
                    "detail_th": "หนึ่งคู่คือหนึ่งจังหวัดหนึ่งวัน นับทุกวันรวมเสาร์อาทิตย์",
                    "count": len(_pairs(rows, pm25, None, "all")),
                },
                {
                    "label_th": "ตัดวันหยุด",
                    "detail_th": f"เหลือเฉพาะจันทร์ถึงศุกร์ และตัดวันหยุดราชการอีก {len(HOLIDAYS)} วัน",
                    "count": len(_pairs(rows, pm25, None, "workday")),
                },
                {
                    "label_th": "รายสัปดาห์",
                    "detail_th": "รวมทั้งสัปดาห์เป็นหนึ่งคู่ ฝุ่นใช้ค่าเฉลี่ย ผู้ป่วยใช้ผลรวม",
                    "count": len(_pairs(rows, pm25, None, "weekly")),
                },
            ],
            "reading_th": "+1 คือไปทางเดียวกันเป๊ะ 0 คือไม่เกี่ยวกัน −1 คือสวนทางกันเป๊ะ งานวิจัยทั่วไปถือว่าต่ำกว่า 0.3 แทบไม่มีความสัมพันธ์",
            "example": _example(rows, pm25),
        },
        "source_th": SOURCE_TH,
        "source_detail_th": SOURCE_DETAIL_TH,
        "source_url": SOURCE_URL,
        "source_note_th": SOURCE_NOTE_TH,
        "imported_at": _imported_at(session),
        "pm25_source_th": PM25_SOURCE_TH,
        "pm25_source_url": PM25_SOURCE_URL,
        "pm25_note_th": PM25_NOTE_TH,
        "pm25_measured": False,
    }
