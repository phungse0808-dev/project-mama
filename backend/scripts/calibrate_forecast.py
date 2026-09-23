"""ปรับค่าตัวคูณของสูตรพยากรณ์ จากค่าที่ระบบเก็บสะสมเองจริง

เรียกใช้
    python -m scripts.calibrate_forecast

ผลที่ได้ต้องนำไปแก้ค่าคงที่และ ACCURACY ใน app/forecast_demo.py ด้วยมือ
เพื่อให้ตัวเลขบนหน้าเว็บตรงกับผลการทดสอบครั้งล่าสุดเสมอ

ใช้ค่าตรวจวัดรายชั่วโมงทั้งหมดในฐานข้อมูล สร้างชุดทดสอบแบบเดียวกับที่หน้าเว็บทำจริง
คือ ค่าเฉลี่ย 24 ชม. ก่อนหน้า กับ 24 ชม. ล่าสุด แล้วทายค่าเฉลี่ยของ 24 ชม. ถัดไป
จากนั้นไล่หาชุดตัวคูณที่คลาดน้อยที่สุด
"""

import itertools
import json
import sqlite3
import statistics
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

DB = str(Path(__file__).resolve().parent.parent / "data" / "airquality.db")
# แคชพยากรณ์อากาศย้อนหลัง ลบไฟล์นี้เมื่ออยากดึงใหม่
CACHE = Path(__file__).resolve().parent.parent / "data" / "calib_weather.json"

MIN_HOURS_PER_PROVINCE = 300
MIN_HOURS_PER_WINDOW = 12
WINDOW = 24

CURRENT = (0.5, 0.20, 0.10, 0.05, 0.05)


def province_series(con) -> tuple[dict, dict]:
    provinces = [
        row[0]
        for row in con.execute(
            """select s.province, count(distinct r.measured_at) h from reading r
               join station s on s.id = r.station_id
               where r.pm25 is not null group by s.province having h >= ?""",
            (MIN_HOURS_PER_PROVINCE,),
        )
    ]
    hourly, coords = {}, {}
    for province in provinces:
        rows = con.execute(
            """select r.measured_at, avg(r.pm25) from reading r
               join station s on s.id = r.station_id
               where s.province = ? and r.pm25 is not null group by r.measured_at""",
            (province,),
        ).fetchall()
        hourly[province] = {
            datetime.fromisoformat(t).replace(minute=0, second=0, microsecond=0): v
            for t, v in rows
        }
        lat, lon = con.execute(
            "select avg(latitude), avg(longitude) from station where province = ?",
            (province,),
        ).fetchone()
        coords[province] = (round(lat, 3), round(lon, 3))
    return hourly, coords


def weather(coords: dict) -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    out = {}
    for index, (province, (lat, lon)) in enumerate(coords.items(), 1):
        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&hourly=precipitation_probability,wind_speed_10m,relative_humidity_2m,temperature_2m"
            "&timezone=Asia%2FBangkok&past_days=92&forecast_days=2"
        )
        out[province] = json.load(urllib.request.urlopen(url, timeout=90))["hourly"]
        print(f"  อากาศ {index}/{len(coords)} {province}", flush=True)
    CACHE.write_text(json.dumps(out), encoding="utf-8")
    return out


def window_mean(series: dict, start: datetime, end: datetime) -> float | None:
    values = [v for t, v in series.items() if start < t <= end and v is not None]
    return statistics.fmean(values) if len(values) >= MIN_HOURS_PER_WINDOW else None


def window_weather(hourly: dict, start: datetime, end: datetime) -> dict | None:
    times = hourly["time"]
    index = [i for i, s in enumerate(times) if start < datetime.fromisoformat(s) <= end]
    if len(index) < MIN_HOURS_PER_WINDOW:
        return None

    def pick(key, how):
        values = [hourly[key][i] for i in index if hourly[key][i] is not None]
        return how(values) if values else None

    return {
        "rain": pick("precipitation_probability", max),
        "wind": pick("wind_speed_10m", max),
        "humidity": pick("relative_humidity_2m", statistics.fmean),
        "heat": pick("temperature_2m", max),
    }


def predict(previous: float, latest: float, w: dict, k) -> float:
    value = latest + k[0] * (latest - previous)
    if w["rain"] is not None:
        value *= 1 - k[1] * w["rain"] / 100
    if w["wind"] is not None:
        value *= 1 - k[2] * min(w["wind"], 30) / 30
    if w["humidity"] is not None:
        value *= 1 - k[3] * max(0, w["humidity"] - 60) / 40
    if w["heat"] is not None:
        value *= 1 - k[4] * min(1, max(0, (w["heat"] - 25) / 10))
    return max(0.0, value)


def score(cases, k) -> tuple[float, float]:
    errors = [predict(c[1], c[2], c[4], k) - c[3] for c in cases]
    return (
        sum(abs(e) for e in errors) / len(errors),
        sum(errors) / len(errors),
    )


def main() -> None:
    con = sqlite3.connect(DB)
    hourly, coords = province_series(con)
    print(f"จังหวัดที่ใช้ {len(hourly)}", flush=True)
    air = weather(coords)

    cases = []
    for province, series in hourly.items():
        if province not in air or not series:
            continue
        first, last = min(series), max(series)
        point = first + timedelta(hours=2 * WINDOW)
        while point + timedelta(hours=WINDOW) <= last:
            previous = window_mean(series, point - timedelta(hours=2 * WINDOW), point - timedelta(hours=WINDOW))
            latest = window_mean(series, point - timedelta(hours=WINDOW), point)
            actual = window_mean(series, point, point + timedelta(hours=WINDOW))
            forecast_weather = window_weather(air[province], point, point + timedelta(hours=WINDOW))
            if None not in (previous, latest, actual) and forecast_weather:
                cases.append((province, previous, latest, actual, forecast_weather))
            point += timedelta(hours=WINDOW)

    print(f"ชุดทดสอบ {len(cases):,} จังหวัด-วัน", flush=True)
    if not cases:
        return

    mae_now, bias_now = score(cases, CURRENT)
    mae_base, bias_base = score(cases, (0, 0, 0, 0, 0))
    print(f"สูตรตอนนี้      MAE {mae_now:.2f}  bias {bias_now:+.2f}")
    print(f"เดาด้วยค่าเมื่อวาน MAE {mae_base:.2f}  bias {bias_base:+.2f}")

    grid = {
        "trend": [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        "rain": [0, 0.02, 0.05, 0.1, 0.15, 0.2],
        "wind": [0, 0.02, 0.05, 0.1],
        "humidity": [0, 0.02, 0.05],
        "heat": [0, 0.02, 0.05],
    }
    best = None
    for k in itertools.product(*grid.values()):
        mae, _ = score(cases, k)
        if best is None or mae < best[0]:
            best = (mae, k)
    mae_best, bias_best = score(cases, best[1])
    print(
        "ดีที่สุด        MAE {:.2f}  bias {:+.2f}  ตัวคูณ trend={} rain={} wind={} humidity={} heat={}".format(
            mae_best, bias_best, *best[1]
        )
    )

    print("\nผลรายจังหวัด 8 อันดับแรกที่มีข้อมูลมากสุด")
    by_province = defaultdict(list)
    for c in cases:
        by_province[c[0]].append(c)
    for province, rows in sorted(by_province.items(), key=lambda kv: -len(kv[1]))[:8]:
        print(
            f"  {province:<12} {len(rows):>3} วัน  ตอนนี้ {score(rows, CURRENT)[0]:5.2f}"
            f"  เดา {score(rows, (0,0,0,0,0))[0]:5.2f}  ปรับแล้ว {score(rows, best[1])[0]:5.2f}"
        )


if __name__ == "__main__":
    main()
