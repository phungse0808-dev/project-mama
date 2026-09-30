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
  // ค่าฝุ่นในหน้านี้มาจากคนละแหล่งตามความยาวของช่วง ต้องบอกผู้ใช้ว่ากำลังดูแหล่งไหน
  const [pmSource, setPmSource] = useState("");
  const [granularity, setGranularity] = useState("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await api.weather(province, days);
        if (!cancelled) {
          setPoints(result.points);
          setPmSource(result.pm25_source_th);
          setGranularity(result.granularity);
        }
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

  const dusty = points.filter((item) => item.pm25 != null);
  const dustAvg =
    dusty.length > 0 ? dusty.reduce((sum, p) => sum + (p.pm25 ?? 0), 0) / dusty.length : null;

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
            {dustAvg != null && (
              <span>
                ฝุ่นเฉลี่ย <strong>{dustAvg.toFixed(1)}</strong> µg/m³
              </span>
            )}
            <span>
              <strong>{points.length}</strong> {granularity === "month" ? "เดือน" : "วัน"}
            </span>
          </div>
        )}
      </div>

      {loading && <p className="empty">กำลังโหลดข้อมูลอากาศ...</p>}
      {error && <p className="empty">{error}</p>}

      {/* กราฟค่าฝุ่นแยกต่างหาก ไม่รวมกับกราฟอากาศ
          ฝุ่นกับฝนคนละหน่วย ถ้าใช้แกนร่วมกันจะบีบให้เส้นหนึ่งแบนติดพื้น
          แยกกราฟทำให้แต่ละตัวมีแกนของตัวเอง แต่ยังอ่านคู่กันได้เพราะแกนนอนตรงกัน */}
      {!loading && !error && dusty.length > 0 && (
        <div className="chart">
          <p className="chart-label">ค่าฝุ่น PM2.5 (µg/m³)</p>
          <ResponsiveContainer width="100%" height={170}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf1" />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 13 }} width={58} />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: "#ccd6e0", background: "#ffffff", color: "#131a24", fontSize: 13.5 }}
                labelFormatter={(label) => `วันที่ ${label}`}
              />
              {/* connectNulls ปิดไว้ เพื่อให้ช่วงที่ยังไม่ได้เก็บข้อมูลเป็นช่องว่างจริง
                  ไม่ใช่เส้นลากข้ามซึ่งจะอ่านเหมือนมีข้อมูล */}
              <Line
                type="monotone"
                dataKey="pm25"
                name="ค่าฝุ่น PM2.5 (µg/m³)"
                stroke="#e8730c"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {pmSource && <p className="weather-source">ค่าฝุ่นในกราฟนี้ {pmSource}</p>}
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="chart">
          <p className="chart-label">อากาศ</p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf1" />
              <XAxis dataKey="label" tick={{ fontSize: 13 }} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 13 }} width={58} unit=" มม." />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 13 }}
                width={51}
                unit=" °C"
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: "#ccd6e0", background: "#ffffff", color: "#131a24", fontSize: 13.5 }}
                labelFormatter={(label) => `วันที่ ${label}`}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="rainfall_mm"
                name="ปริมาณฝน (มม.)"
                fill="#1f5fa0"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="temp_avg"
                name="อุณหภูมิเฉลี่ย (°C)"
                stroke="#c0392b"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="wind_speed"
                name="ความเร็วลม (m/s)"
                stroke="#0d7e5a"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {granularity === "month" && (
            <p className="weather-source">
              ช่วงยาวถูกยุบเป็นค่าเฉลี่ยรายเดือน ฝนแสดงเป็นค่าเฉลี่ยต่อวันของเดือนนั้น
              ไม่ใช่ผลรวมทั้งเดือน จะได้เทียบกับมุมมองรายวันได้ตรง ๆ
            </p>
          )}
        </div>
      )}

      <p className="weather-note">
        ฝนชะล้างฝุ่นออกจากอากาศและลมพัดฝุ่นกระจายออกจากพื้นที่ ช่วงที่ฝนตกน้อยและลมนิ่ง
        จึงเป็นช่วงที่ฝุ่นสะสมมากที่สุด ซึ่งตรงกับฤดูหมอกควันของไทยระหว่างเดือนกุมภาพันธ์ถึงเมษายน
      </p>
    </section>
  );
}
