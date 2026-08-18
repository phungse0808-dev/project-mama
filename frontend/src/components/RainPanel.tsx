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
import type { RainChance } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string | null;
};

/**
 * โอกาสฝนตกและสภาพอากาศล่าสุด
 *
 * โอกาสฝนตกคิดจากสถิติย้อนหลัง ไม่ใช่การพยากรณ์ เพราะข้อมูลที่ระบบมี
 * เป็นข้อมูลย้อนหลังจาก NASA POWER เท่านั้น ไม่มีข้อมูลพยากรณ์
 * ตัวเลขจึงบอกได้แค่ว่าช่วงนี้ของปีฝนมักตกบ่อยแค่ไหน
 *
 * เกี่ยวกับฝุ่นตรงที่ฝนเป็นตัวชะฝุ่นออกจากอากาศ
 * ช่วงที่โอกาสฝนตกต่ำจึงเป็นช่วงที่ฝุ่นสะสมได้ง่าย
 */
export function RainPanel({ provinces, defaultProvince }: Props) {
  const [province, setProvince] = useState(defaultProvince ?? provinces[0] ?? "");
  const [data, setData] = useState<RainChance | null>(null);
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

  const header = (
    <>
      <h2 className="panel-title">
        โอกาสฝนตกวันนี้
        <span className="panel-hint">คิดจากสถิติย้อนหลัง ไม่ใช่การพยากรณ์</span>
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

      <div className="rain-summary">
        <div className="rain-figure" style={{ background: chanceColor }}>
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
            สภาพอากาศล่าสุด
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
        ตัวเลขนี้ <strong>ไม่ใช่การพยากรณ์อากาศ</strong> เพราะไม่ได้ดูสภาพบรรยากาศจริง
        ในขณะนี้เลย เป็นความถี่ที่เคยเกิดขึ้นจริงในช่วงวันเดียวกันของปีก่อนๆ
        ซึ่งทางวิชาการเรียกว่าความน่าจะเป็นเชิงภูมิอากาศ บอกได้ว่าช่วงนี้ของปี
        ฝนมักตกบ่อยแค่ไหน แต่บอกไม่ได้ว่าวันนี้จะตกหรือไม่
        <br />
        ระบบไม่มีข้อมูลพยากรณ์ เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลย้อนหลัง
        และตามหลังปัจจุบันอยู่ราวสามถึงห้าวัน สภาพอากาศที่แสดงจึงเป็นของวันล่าสุด
        ที่มีข้อมูล ไม่ใช่ของวันนี้ และบอกวันที่กำกับไว้เสมอ
        <br />
        เรื่องนี้เกี่ยวกับฝุ่นตรงที่ฝนเป็นตัวชะฝุ่นออกจากอากาศ
        เดือนที่โอกาสฝนตกต่ำจึงเป็นเดือนที่ฝุ่นสะสมได้ง่ายกว่า
      </p>
    </section>
  );
}
