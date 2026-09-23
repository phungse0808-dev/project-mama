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

import statistics
from collections import defaultdict

from sqlmodel import Session, select

from app.models import DiseaseAgeSummary, DiseaseMonthly, Pm25Monthly

# ช่วงค่าฝุ่นที่ใช้แบ่งกลุ่ม ใช้ขอบเดียวกับระดับคุณภาพอากาศของไทยใน app.aqi
BUCKETS = [
    ("ดีมาก", "0–15", 0.0, 15.0),
    ("ดี", "15–25", 15.0, 25.0),
    ("ปานกลาง", "25–37.5", 25.0, 37.5),
    ("เกินมาตรฐาน", "เกิน 37.5", 37.5, float("inf")),
]

# กลุ่มโรคที่ใช้เป็นตัวแทนในกราฟ เพราะเป็นกลุ่มที่คนนึกถึงก่อนเมื่อพูดถึงฝุ่น
MAIN_DISEASE = "โรคติดเชื้อทางเดินหายใจส่วนบนเฉียบพลัน"

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
    for row in session.exec(select(DiseaseMonthly)).all():
        cases[(row.province, row.ym, row.disease)] = row.persons
    return pm, cases


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


_cache: dict | None = None


def dust_cases(session: Session) -> dict:
    """ข้อมูลทั้งหมดของหน้าฝุ่นกับผู้ป่วย

    คำนวณครั้งแรกใช้เวลาราวสิบวินาทีเพราะต้องไล่ข้อมูลสามหมื่นแถวหลายรอบ
    ผลจึงเก็บไว้ในหน่วยความจำ ข้อมูลชุดนี้เป็นข้อมูลนิ่งที่เปลี่ยนเฉพาะตอนนำเข้าใหม่
    ซึ่งต้องรีสตาร์ตเซิร์ฟเวอร์อยู่แล้ว
    """
    global _cache
    if _cache is not None:
        return _cache
    _cache = _compute(session)
    return _cache


def _compute(session: Session) -> dict:
    pm, cases = _load(session)
    if not pm or not cases:
        return {"available": False, "reason": "ยังไม่มีข้อมูลผู้ป่วยหรือค่าฝุ่นย้อนหลัง"}

    diseases = sorted({d for _, _, d in cases})
    provinces = sorted({p for p, _ in pm})
    months = sorted({m for _, m in pm})

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
        "pairs": sum(1 for key in pm if key in cases_by_month),
        "total_cases": sum(cases.values()),
        "main_disease": MAIN_DISEASE,
        "buckets": buckets,
        "correlations": correlations,
        "seasonal": seasonal,
        "age_top": age_top,
        "note_th": NOTE_TH,
        "disease_source_th": next(iter(session.exec(select(DiseaseMonthly.source)).all()), ""),
        "pm25_source_th": next(iter(session.exec(select(Pm25Monthly.source)).all()), ""),
    }
