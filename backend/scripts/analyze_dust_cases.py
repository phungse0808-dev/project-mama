"""วิเคราะห์ความสัมพันธ์ระหว่างค่าฝุ่นรายวันกับจำนวนผู้ป่วย 4 กลุ่มโรค

เหตุที่ต้องมีสคริปต์นี้
    ข้อมูลผู้ป่วยที่ระบบมีเป็นของปี 2566 แต่ค่าฝุ่นที่ระบบเก็บเองเริ่มกลางปี 2569
    จึงจับคู่กันตรง ๆ ไม่ได้ สคริปต์นี้ดึงค่าฝุ่นย้อนหลังปี 2566 จากคลังข้อมูลของ
    Open-Meteo ซึ่งเป็นค่าจากแบบจำลอง CAMS ไม่ใช่ค่าที่สถานีวัดได้
    ผลที่ได้จึงใช้บรรยายแนวโน้มได้ แต่ไม่ใช่ค่าตรวจวัดจริงของพื้นที่

สิ่งที่สคริปต์ทำ
    1. ดึงค่าฝุ่นรายชั่วโมงปี 2566 ของ 5 จังหวัดที่มีข้อมูลผู้ป่วย แล้วเฉลี่ยเป็นรายวัน
    2. ตัดเสาร์อาทิตย์และวันหยุดราชการออก เพราะจำนวนผู้ป่วยนับจากวันที่มารักษา
       วันที่คลินิกปิดจึงมีผู้ป่วยน้อยโดยไม่เกี่ยวกับฝุ่น
    3. หาค่าสหสัมพันธ์ทั้งแบบรายวันและรายสัปดาห์ พร้อมช่วงหน่วงเวลา
    4. เทียบจำนวนผู้ป่วยเฉลี่ยต่อวันทำการ ระหว่างวันฝุ่นต่ำกับวันฝุ่นสูง

เรียกใช้
    python -m scripts.analyze_dust_cases
"""

import datetime
import json
import statistics
import urllib.request
from pathlib import Path

from sqlmodel import Session, select

from app.db import engine
from app.models import DiseaseDaily, Station

ARCHIVE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
START, END = "2023-01-01", "2023-08-31"

# เก็บไว้ที่เดียวกับที่ app/dust_cases.py อ่าน จะได้ไม่มีสองก๊อปปี้ให้ไม่ตรงกัน
CACHE = Path(__file__).resolve().parent.parent / "data" / "pm25_2023.json"

# วันหยุดราชการปี 2566 ในช่วงที่มีข้อมูล ตัดออกพร้อมเสาร์อาทิตย์
HOLIDAYS = {
    "2023-01-02", "2023-03-06", "2023-04-06", "2023-04-13", "2023-04-14",
    "2023-04-15", "2023-04-17", "2023-05-01", "2023-05-04", "2023-05-05",
    "2023-06-03", "2023-06-05", "2023-07-28", "2023-08-01", "2023-08-02",
    "2023-08-14",
}

# อย่างน้อยกี่ชั่วโมงจึงนับว่าวันนั้นมีข้อมูลพอ
MIN_HOURS = 20

# ช่วงค่าฝุ่นที่ใช้แบ่งกลุ่ม ตามระดับคุณภาพอากาศของไทย
BUCKETS = [("0-15 ดีมาก", 0.0, 15.0), ("15-25 ดี", 15.0, 25.0),
           ("25-37.5 ปานกลาง", 25.0, 37.5), ("เกิน 37.5 เกินมาตรฐาน", 37.5, 1e9)]


def province_centroid(session: Session) -> dict[str, tuple[float, float]]:
    """จุดกึ่งกลางของสถานีในจังหวัด ใช้เป็นพิกัดขอค่าฝุ่นย้อนหลัง"""
    out: dict[str, tuple[float, float]] = {}
    for province in sorted({row.province for row in session.exec(select(DiseaseDaily)).all()}):
        stations = session.exec(select(Station).where(Station.province == province)).all()
        if stations:
            out[province] = (
                round(statistics.fmean(s.latitude for s in stations), 3),
                round(statistics.fmean(s.longitude for s in stations), 3),
            )
    return out


def daily_pm25(centroids: dict[str, tuple[float, float]]) -> dict[str, dict[str, float]]:
    """ค่าฝุ่นเฉลี่ยรายวันของแต่ละจังหวัด ดึงครั้งเดียวแล้วเก็บแคชไว้"""
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))

    result: dict[str, dict[str, float]] = {}
    for province, (lat, lon) in centroids.items():
        url = (f"{ARCHIVE_URL}?latitude={lat}&longitude={lon}&hourly=pm2_5"
               f"&start_date={START}&end_date={END}&timezone=Asia%2FBangkok")
        hourly = json.load(urllib.request.urlopen(url, timeout=90))["hourly"]
        by_day: dict[str, list[float]] = {}
        for stamp, value in zip(hourly["time"], hourly["pm2_5"]):
            if value is not None:
                by_day.setdefault(stamp[:10], []).append(value)
        result[province] = {
            day: statistics.fmean(values)
            for day, values in by_day.items()
            if len(values) >= MIN_HOURS
        }
        print(f"ดึงค่าฝุ่น {province} ได้ {len(result[province])} วัน")
    CACHE.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 3:
        return 0.0
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    top = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    bottom = (sum((a - mx) ** 2 for a in xs) * sum((b - my) ** 2 for b in ys)) ** 0.5
    return top / bottom if bottom else 0.0


def is_workday(day_text: str) -> bool:
    day = datetime.date.fromisoformat(day_text)
    return day.weekday() < 5 and day_text not in HOLIDAYS


def main() -> None:
    with Session(engine) as session:
        centroids = province_centroid(session)
        pm25 = daily_pm25(centroids)
        cases = [
            (row.province, row.observed_on.isoformat() if hasattr(row.observed_on, "isoformat")
             else str(row.observed_on), row.disease_group, row.cases)
            for row in session.exec(select(DiseaseDaily)).all()
        ]

    groups = sorted({group for _, _, group, _ in cases})

    print("\nผู้ป่วยเฉลี่ยต่อวัน แยกตามวันในสัปดาห์")
    names = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
    per_day: dict[int, list[int]] = {}
    totals: dict[str, int] = {}
    for _, day_text, _, count in cases:
        totals[day_text] = totals.get(day_text, 0) + count
    for day_text, total in totals.items():
        per_day.setdefault(datetime.date.fromisoformat(day_text).weekday(), []).append(total)
    for index in range(7):
        print(f"  {names[index]:<10} {statistics.fmean(per_day[index]):6.0f} ราย")

    print("\nค่าสหสัมพันธ์ระหว่างค่าฝุ่นกับจำนวนผู้ป่วย")
    print(f"  {'กลุ่มโรค':<26}{'ทุกวัน':>10}{'ตัดวันหยุด':>12}{'รายสัปดาห์':>12}")
    for group in groups + [None]:
        line = []
        for mode in ("raw", "workday", "weekly"):
            bag: dict[tuple, list[float]] = {}
            for province, day_text, disease, count in cases:
                if group and disease != group:
                    continue
                if mode != "raw" and not is_workday(day_text):
                    continue
                value = pm25.get(province, {}).get(day_text)
                if value is None:
                    continue
                if mode == "weekly":
                    key = (province, datetime.date.fromisoformat(day_text).isocalendar()[:2])
                else:
                    key = (province, day_text)
                slot = bag.setdefault(key, [0.0, 0.0, 0.0])
                slot[0] += value
                slot[1] += 1
                slot[2] += count
            line.append(pearson([s[0] / s[1] for s in bag.values()], [s[2] for s in bag.values()]))
        print(f"  {(group or 'รวมทุกกลุ่ม'):<26}" + "".join(f"{v:>+12.2f}" for v in line))

    print("\nผู้ป่วยเฉลี่ยต่อวันทำการ แยกตามช่วงค่าฝุ่นของวันนั้น")
    print(f"  {'ช่วงค่าฝุ่น':<24}{'วัน':>6}" + "".join(f"{g.replace('กลุ่มโรค', ''):>14}" for g in groups))
    for label, low, high in BUCKETS:
        bag: dict[str, list[int]] = {}
        days: set[tuple[str, str]] = set()
        for province, day_text, disease, count in cases:
            if not is_workday(day_text):
                continue
            value = pm25.get(province, {}).get(day_text)
            if value is None or not low <= value < high:
                continue
            bag.setdefault(disease, []).append(count)
            days.add((province, day_text))
        means = "".join(
            f"{statistics.fmean(bag[g]) if bag.get(g) else 0:>14.0f}" for g in groups
        )
        print(f"  {label:<24}{len(days):>6}{means}")


if __name__ == "__main__":
    main()
