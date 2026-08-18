import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { WeatherPoint } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string | null;
};

const RANGES = [
  { days: 30, label: "1 เดือน" },
  { days: 90, label: "3 เดือน" },
  { days: 365, label: "1 ปี" },
  { days: 1825, label: "5 ปี" },
];

/**
 * แผงข้อมูลอากาศย้อนหลัง
 *
 * ข้อมูลชุดนี้คือตัวแปรต้นของโมเดลพยากรณ์ที่จะทำต่อไป จึงต้องแสดงให้เห็นว่า
 * ระบบมีข้อมูลอะไรอยู่บ้าง ฝนกับลมเป็นตัวชะล้างและพัดกระจายฝุ่น
 * ส่วนความกดอากาศสูงกับลมนิ่งทำให้ฝุ่นสะสม
 *
 * แสดงฝนเป็นแท่งเพราะเป็นปริมาณสะสมรายวัน ส่วนอุณหภูมิกับลมเป็นเส้นเพราะเป็นค่าต่อเนื่อง
 */
export function WeatherPanel({ provinces, defaultProvince }: Props) {
  const [province, setProvince] = useState(defaultProvince ?? "เชียงใหม่");
  const [days, setDays] = useState(90);
  const [points, setPoints] = useState<WeatherPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await api.weather(province, days);
        if (!cancelled) setPoints(result.points);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "โหลดข้อมูลอากาศไม่สำเร็จ");
          setPoints([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [province, days]);

  // ช่วงเวลายาวมีจุดข้อมูลมากเกินกว่าจะอ่านออก จึงสุ่มเว้นระยะให้เหลือราว 120 จุด
  const step = Math.max(1, Math.ceil(points.length / 120));
  const chartData = points.filter((_, index) => index % step === 0);

  const rainTotal = points.reduce((sum, p) => sum + (p.rainfall_mm ?? 0), 0);
  const tempAvg =
    points.length > 0
      ? points.reduce((sum, p) => sum + (p.temp_avg ?? 0), 0) / points.length
      : null;

  return (
    <section className="panel">
      <h2 className="panel-title">
        ข้อมูลอากาศย้อนหลัง
        <span className="panel-hint">ตัวแปรที่ใช้อธิบายการสะสมและการกระจายของฝุ่น</span>
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

        <div className="range-buttons">
          {RANGES.map((range) => (
            <button
              key={range.days}
              className={days === range.days ? "range active" : "range"}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>

        {points.length > 0 && (
          <div className="weather-stats">
            <span>
              ฝนรวม <strong>{rainTotal.toFixed(0)}</strong> มม.
            </span>
            <span>
              อุณหภูมิเฉลี่ย <strong>{tempAvg?.toFixed(1)}</strong> °C
            </span>
            <span>
              <strong>{points.length}</strong> วัน
            </span>
          </div>
        )}
      </div>

      {loading && <p className="empty">กำลังโหลดข้อมูลอากาศ...</p>}
      {error && <p className="empty">{error}</p>}

      {!loading && !error && chartData.length > 0 && (
        <div className="chart">
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={54} unit=" มม." />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                width={48}
                unit=" °C"
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: "#d8dde5", fontSize: 13 }}
                labelFormatter={(label) => `วันที่ ${label}`}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="rainfall_mm"
                name="ปริมาณฝน (มม.)"
                fill="#7fb3e8"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="temp_avg"
                name="อุณหภูมิเฉลี่ย (°C)"
                stroke="#e2574c"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="wind_speed"
                name="ความเร็วลม (m/s)"
                stroke="#00a06a"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="weather-note">
        ฝนชะล้างฝุ่นออกจากอากาศและลมพัดฝุ่นกระจายออกจากพื้นที่ ช่วงที่ฝนตกน้อยและลมนิ่ง
        จึงเป็นช่วงที่ฝุ่นสะสมมากที่สุด ซึ่งตรงกับฤดูหมอกควันของไทยระหว่างเดือนกุมภาพันธ์ถึงเมษายน
      </p>
    </section>
  );
}
