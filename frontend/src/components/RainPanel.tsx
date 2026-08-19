import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { RainChance, WeatherNow } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string | null;
};

/**
 * โอกาสฝนตกและสภาพอากาศ
 *
 * แสดงสองตัวเลขคู่กันโดยตั้งใจ เพราะเป็นคนละอย่างและตอบคนละคำถาม
 *   พยากรณ์วันนี้    จาก Open-Meteo ดูสภาพบรรยากาศจริงตอนนี้ ตอบว่าวันนี้จะตกไหม
 *   สถิติย้อนหลัง    คำนวณเองจากข้อมูล NASA POWER หกปี ตอบว่าช่วงนี้ของปีฝนตกบ่อยแค่ไหน
 *
 * ตัวหลังเป็นส่วนที่ระบบคำนวณเอง จึงเก็บไว้แม้จะมีพยากรณ์จริงแล้ว
 * และเวลาสองค่าต่างกันมากก็เป็นข้อสังเกตที่มีความหมายในตัวมันเอง
 *
 * เกี่ยวกับฝุ่นตรงที่ฝนเป็นตัวชะฝุ่นออกจากอากาศ
 * ช่วงที่โอกาสฝนตกต่ำจึงเป็นช่วงที่ฝุ่นสะสมได้ง่าย
 */
export function RainPanel({ provinces, defaultProvince }: Props) {
  const [province, setProvince] = useState(defaultProvince ?? provinces[0] ?? "");
  const [data, setData] = useState<RainChance | null>(null);
  const [now, setNow] = useState<WeatherNow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!province) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api.rainChance(province);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province]);

  // ดึงสภาพอากาศปัจจุบันแยกอีกชุด เพราะมาจากคนละแหล่ง
  // ถ้าแหล่งใดแหล่งหนึ่งล่ม อีกส่วนต้องยังแสดงได้ตามปกติ
  useEffect(() => {
    if (!province) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.weatherNow(province);
        if (!cancelled) setNow(result.available ? result : null);
      } catch {
        if (!cancelled) setNow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province]);

  const header = (
    <>
      <h2 className="panel-title">
        โอกาสฝนตกและสภาพอากาศ
        <span className="panel-hint">พยากรณ์จริงคู่กับสถิติย้อนหลัง</span>
      </h2>
      <div className="weather-controls">
        <label>
          จังหวัด
          <select value={province} onChange={(event) => setProvince(event.target.value)}>
            {provinces.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );

  if (loading) {
    return (
      <section className="panel">
        {header}
        <p className="empty">กำลังคำนวณ...</p>
      </section>
    );
  }

  if (!data?.available) {
    return (
      <section className="panel">
        {header}
        <p className="empty">{data?.reason ?? "คำนวณไม่ได้"}</p>
      </section>
    );
  }

  const chance = data.chance_pct ?? 0;
  const latest = data.latest;
  const normal = data.normal;
  const years = data.years ?? [];

  // ไล่สีตามระดับโอกาส ยิ่งฟ้าเข้มยิ่งมีโอกาสสูง ใช้แนวเดียวกับสีระดับคุณภาพอากาศ
  const chanceColor = chance >= 70 ? "#1d6fd0" : chance >= 40 ? "#00a86b" : "#e59500";

  return (
    <section className="panel">
      {header}

      {now && (
        <div className="now-block">
          <div className="now-head">
            <div>
              <p className="now-temp">
                {now.temperature ?? "-"}
                <small> °C</small>
              </p>
              <p className="now-condition">{now.condition}</p>
            </div>
            <div className="now-forecast" style={{ borderColor: chanceColor }}>
              <p className="now-forecast-value" style={{ color: chanceColor }}>
                {now.rain_chance_pct ?? "-"}
                <small>%</small>
              </p>
              <p className="now-forecast-label">พยากรณ์โอกาสฝนวันนี้</p>
            </div>
          </div>

          <div className="rain-stats">
            <div>
              <p className="rain-stat-value">
                {now.humidity ?? "—"}
                <small> %</small>
              </p>
              <p className="rain-stat-label">ความชื้น</p>
            </div>
            <div>
              <p className="rain-stat-value">
                {now.wind_speed ?? "—"}
                <small> km/h</small>
              </p>
              <p className="rain-stat-label">ความเร็วลม</p>
            </div>
            <div>
              <p className="rain-stat-value">
                {now.temp_max ?? "—"}
                <small> / {now.temp_min ?? "—"} °C</small>
              </p>
              <p className="rain-stat-label">สูงสุด / ต่ำสุดวันนี้</p>
            </div>
            <div>
              <p className="rain-stat-value">
                {now.rain_today_mm ?? "—"}
                <small> มม.</small>
              </p>
              <p className="rain-stat-label">ฝนสะสมที่คาดวันนี้</p>
            </div>
          </div>

          <p className="now-stamp">
            วัดเมื่อ {now.observed_at?.replace("T", " เวลา ")} น.
            {now.minutes_behind != null ? ` (${now.minutes_behind} นาทีที่แล้ว)` : ""} ·
            แหล่งข้อมูล {now.source}
          </p>
        </div>
      )}

      <h3 className="rain-subtitle">
        สถิติย้อนหลังของช่วงวันนี้
        <span className="panel-hint">ระบบคำนวณเองจากข้อมูล {years.length} ปี</span>
      </h3>

      <div className="rain-summary">
        <div className="rain-figure" style={{ backgroundColor: chanceColor }}>
          <strong>{chance}</strong>
          <small>%</small>
        </div>
        <div className="rain-detail">
          <p className="rain-headline">
            ช่วงวันนี้ของปี ฝนตก <strong>{data.rain_days}</strong> วัน จาก{" "}
            <strong>{data.samples}</strong> วันที่เคยวัดได้
          </p>
          <p className="rain-note">
            นับวันเดียวกันบวกลบ {data.window_days} วัน ของปี {years[0]}–
            {years[years.length - 1]} รวม {years.length} ปี · นับว่าฝนตกเมื่อวัดได้ตั้งแต่{" "}
            {data.threshold_mm} มม. ขึ้นไป ตามเกณฑ์ขององค์การอุตุนิยมวิทยาโลก
          </p>
        </div>
      </div>

      {latest && (
        <>
          <h3 className="rain-subtitle">
            สภาพอากาศล่าสุดในชุดข้อมูลวิจัย
            <span className="panel-hint">
              วันที่ {latest.observed_on} · ตามหลังวันนี้ {latest.days_behind} วัน
            </span>
          </h3>

          <div className="rain-stats">
            <div>
              <p className="rain-stat-value">
                {latest.temp_avg?.toFixed(1) ?? "—"}
                <small> °C</small>
              </p>
              <p className="rain-stat-label">
                อุณหภูมิเฉลี่ย
                {normal?.temp_avg != null ? " · ปกติ " + normal.temp_avg : ""}
              </p>
            </div>
            <div>
              <p className="rain-stat-value">
                {latest.humidity?.toFixed(0) ?? "—"}
                <small> %</small>
              </p>
              <p className="rain-stat-label">
                ความชื้น
                {normal?.humidity != null ? " · ปกติ " + normal.humidity : ""}
              </p>
            </div>
            <div>
              <p className="rain-stat-value">
                {latest.wind_speed?.toFixed(1) ?? "—"}
                <small> m/s</small>
              </p>
              <p className="rain-stat-label">
                ความเร็วลม
                {normal?.wind_speed != null ? " · ปกติ " + normal.wind_speed : ""}
              </p>
            </div>
            <div>
              <p className="rain-stat-value">
                {latest.rainfall_mm?.toFixed(1) ?? "—"}
                <small> มม.</small>
              </p>
              <p className="rain-stat-label">ปริมาณฝนวันนั้น</p>
            </div>
          </div>
        </>
      )}

      <h3 className="rain-subtitle">
        โอกาสฝนตกตลอดทั้งปี
        <span className="panel-hint">แท่งสีเข้มคือเดือนนี้</span>
      </h3>

      <div className="chart">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data.monthly} margin={{ top: 18, right: 16, bottom: 4, left: -14 }}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="%" width={52} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, borderColor: "#d8dde5", fontSize: 13 }}
              formatter={(value) => [value + "%", "โอกาสฝนตก"]}
            />
            <Bar dataKey="chance_pct" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="chance_pct" position="top" fontSize={11} />
              {(data.monthly ?? []).map((item) => (
                <Cell
                  key={item.month}
                  fill={item.month === data.this_month ? "#1d6fd0" : "#c9d9ef"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="weather-note">
        หน้านี้ใช้ข้อมูลสองแหล่ง แยกหน้าที่กันชัดเจนและไม่นำมาปนกัน
        <br />
        <strong>สภาพอากาศตอนนี้และพยากรณ์วันนี้</strong> มาจาก Open-Meteo
        ซึ่งอัปเดตทุก 15 นาที เป็นค่า ณ ขณะนี้จริงและดูสภาพบรรยากาศปัจจุบัน
        <br />
        <strong>สถิติย้อนหลัง</strong> ระบบคำนวณเองจากข้อมูล NASA POWER ย้อนหลังหกปี
        ไม่ใช่การพยากรณ์ แต่เป็นความถี่ที่เคยเกิดขึ้นจริงในช่วงวันเดียวกันของปีก่อนๆ
        ซึ่งทางวิชาการเรียกว่าความน่าจะเป็นเชิงภูมิอากาศ ใช้เป็นฐานเปรียบเทียบว่า
        วันนี้ผิดปกติไปจากช่วงเดียวกันของปีก่อนหรือไม่ ส่วนที่ NASA POWER ทำไม่ได้
        คือบอกสภาพอากาศปัจจุบัน เพราะเผยแพร่เฉพาะข้อมูลย้อนหลังและตามหลังสามถึงห้าวันเสมอ
        <br />
        เรื่องนี้เกี่ยวกับฝุ่นตรงที่ฝนเป็นตัวชะฝุ่นออกจากอากาศ
        เดือนที่โอกาสฝนตกต่ำจึงเป็นเดือนที่ฝุ่นสะสมได้ง่ายกว่า
      </p>
    </section>
  );
}
