import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Area,
  AreaChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { StationDaily, StationHistory, StationReading } from "../api";

type Props = {
  history: StationHistory | null;
  loading: boolean;
  stations: StationReading[];
  onSelectStation: (stationCode: string) => void;
};

/**
 * กราฟแนวโน้มค่าฝุ่นของสถานีที่เลือก
 *
 * มีสองมุมมอง
 *   รายชั่วโมง  ใช้ดูความเปลี่ยนแปลงระหว่างวัน เช่นช่วงเช้ากับช่วงเย็นต่างกันแค่ไหน
 *   รายวัน      ใช้เทียบกับมาตรฐานของประเทศไทย ซึ่งกำหนดเป็นค่าเฉลี่ย 24 ชั่วโมง
 *               ไม่ใช่ค่า ณ ชั่วโมงใดชั่วโมงหนึ่ง การเทียบค่ารายชั่วโมงกับมาตรฐาน
 *               โดยตรงจึงไม่ถูกต้องตามหลักวิชาการ
 */
export function StationTrend({ history, loading, stations, onSelectStation }: Props) {
  const [mode, setMode] = useState<"hourly" | "daily">("hourly");
  const [daily, setDaily] = useState<StationDaily | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);

  useEffect(() => {
    if (mode !== "daily" || !history) return;

    let cancelled = false;
    setDailyLoading(true);
    void (async () => {
      try {
        const result = await api.stationDaily(history.station_code, 30);
        if (!cancelled) setDaily(result);
      } finally {
        if (!cancelled) setDailyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, history]);

  // รายชื่อจังหวัดที่มีสถานี เรียงตามตัวอักษรเพื่อให้หาง่าย
  const provinces = useMemo(
    () => [...new Set(stations.map((item) => item.province))].sort((a, b) => a.localeCompare(b, "th")),
    [stations],
  );

  // ข้อมูลล่าสุดของสถานีที่กำลังดู ใช้แสดงระดับคุณภาพอากาศคู่กับกราฟ
  // เพราะตัวเลขในกราฟบอกแค่ปริมาณ ไม่ได้บอกว่าระดับนั้นอันตรายแค่ไหน
  const current = useMemo(
    () => stations.find((item) => item.station_code === history?.station_code) ?? null,
    [stations, history],
  );

  // สถานีในจังหวัดที่กำลังดูอยู่ ใช้ให้ผู้ใช้สลับสถานีภายในจังหวัดเดียวกันได้
  const stationsInProvince = useMemo(
    () => stations.filter((item) => item.province === history?.province),
    [stations, history],
  );

  if (loading) {
    return (
      <section className="panel">
        <h2 className="panel-title">แนวโน้มค่าฝุ่นย้อนหลัง</h2>
        <p className="empty">กำลังโหลด...</p>
      </section>
    );
  }

  if (!history) {
    return (
      <section className="panel">
        <h2 className="panel-title">แนวโน้มค่าฝุ่นย้อนหลัง</h2>
        <p className="empty">เลือกสถานีจากแผนที่หรือปุ่มค้นหาเพื่อดูกราฟ</p>
      </section>
    );
  }

  function changeProvince(province: string) {
    const first = stations.find((item) => item.province === province);
    if (first) onSelectStation(first.station_code);
  }

  const picker = (
    <>
      <label>
        จังหวัด
        <select value={history?.province ?? ""} onChange={(event) => changeProvince(event.target.value)}>
          {provinces.map((province) => (
            <option key={province} value={province}>
              {province}
            </option>
          ))}
        </select>
      </label>

      <label>
        สถานี
        <select
          value={history?.station_code ?? ""}
          onChange={(event) => onSelectStation(event.target.value)}
        >
          {stationsInProvince.map((station) => (
            <option key={station.station_code} value={station.station_code}>
              {station.name_th}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  const header = (
    <>
      <h2 className="panel-title">
        แนวโน้มค่าฝุ่นย้อนหลัง
        <span className="panel-hint">
          {history.name_th} จ.{history.province}
        </span>
        {current && (
          <span
            className="trend-status"
            style={{
              // พื้นโปร่งไล่สีจากสีระดับ ให้เข้าชุดกับการ์ดอื่นในหน้า
              background: `linear-gradient(150deg, ${current.level.color}33, ${current.level.color}12)`,
              borderColor: `${current.level.color}59`,
            }}
          >
            {current.level.label_th}
            <strong>{current.pm25 ?? "-"}</strong>
            <small>µg/m³</small>
          </span>
        )}
      </h2>
      <div className="weather-controls">
        {picker}
        <div className="range-buttons">
          <button
            className={mode === "hourly" ? "range active" : "range"}
            onClick={() => setMode("hourly")}
          >
            รายชั่วโมง
          </button>
          <button
            className={mode === "daily" ? "range active" : "range"}
            onClick={() => setMode("daily")}
          >
            รายวัน
          </button>
        </div>
      </div>
    </>
  );

  if (mode === "daily") {
    if (dailyLoading || !daily) {
      return (
        <section className="panel">
          {header}
          <p className="empty">กำลังโหลดค่าเฉลี่ยรายวัน...</p>
        </section>
      );
    }

    return (
      <section className="panel">
        {header}

        <div className="daily-summary">
          <span>
            มีข้อมูล <strong>{daily.days_total}</strong> วัน
          </span>
          <span>
            ชั่วโมงครบตามเกณฑ์ <strong>{daily.days_complete}</strong> วัน
          </span>
          <span>
            เกินมาตรฐานไทย <strong>{daily.days_over_standard}</strong> วัน
          </span>
        </div>

        {daily.points.length === 0 ? (
          <p className="empty">ยังไม่มีข้อมูลเพียงพอ</p>
        ) : (
          <div className="chart">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={daily.points}
                margin={{ top: 8, right: 16, bottom: 8, left: -8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,150,190,.12)" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit=" µg/m³" width={82} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, borderColor: "#2b3d52", background: "#0d1420", color: "#eaf6ff", fontSize: 13 }}
                  labelFormatter={(label) => `วันที่ ${label}`}
                />
                <Legend />
                {/* เส้นมาตรฐานไทย ทำให้เห็นทันทีว่าวันไหนเกิน */}
                <ReferenceLine
                  y={daily.thai_standard}
                  stroke="#e2574c"
                  strokeDasharray="5 4"
                  label={{
                    value: `มาตรฐานไทย ${daily.thai_standard}`,
                    position: "insideTopRight",
                    fontSize: 11,
                    fill: "#f08080",
                  }}
                />
                <Bar
                  dataKey="pm25_avg"
                  name="ค่าเฉลี่ยรายวัน"
                  fill="#3a7fc4"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  type="monotone"
                  dataKey="pm25_max"
                  name="ค่าสูงสุดในวัน"
                  stroke="#e2574c"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="weather-note">
          มาตรฐาน PM2.5 ของประเทศไทยกำหนดเป็นค่าเฉลี่ย 24 ชั่วโมง การเทียบค่ารายชั่วโมง
          กับมาตรฐานโดยตรงจึงไม่ถูกต้อง หน้านี้จึงคำนวณค่าเฉลี่ยรายวันให้ โดยวันที่มีข้อมูล
          ไม่ถึง {daily.min_hours_per_day} ชั่วโมงจะไม่นับว่าเชื่อถือได้ เพราะค่าเฉลี่ย
          จะเอนไปตามช่วงเวลาที่บังเอิญเก็บได้
        </p>
      </section>
    );
  }

  // ระบบเพิ่งเริ่มเก็บข้อมูล บางสถานีจึงยังมีข้อมูลไม่กี่จุด
  const tooFew = history.points.length < 2;

  return (
    <section className="panel">
      {header}
      {tooFew ? (
        <p className="empty">
          สถานีนี้มีข้อมูลเพียง {history.points.length} จุด
          ระบบเพิ่งเริ่มเก็บข้อมูลจึงยังวาดกราฟไม่ได้ ข้อมูลจะเพิ่มขึ้นทุกชั่วโมง
        </p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={history.points} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
              {/* พื้นไล่สีใต้เส้น จางลงจนหายไปที่ฐาน
                  ทำให้เห็นแนวโน้มเป็นปริมาตร ไม่ใช่แค่เส้นบาง ๆ */}
              <defs>
                <linearGradient id="pm25Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5ec8ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#5ec8ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="pm10Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0a326" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#f0a326" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,150,190,.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit=" µg/m³" width={80} />
              <Tooltip
                contentStyle={{ borderRadius: 8, borderColor: "#2b3d52", background: "#0d1420", color: "#eaf6ff", fontSize: 13 }}
                labelFormatter={(label) => `เวลา ${label}`}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="pm25"
                name="PM2.5"
                stroke="#5ec8ff"
                strokeWidth={2}
                fill="url(#pm25Fill)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
                style={{ filter: "drop-shadow(0 0 5px rgba(94,200,255,.65))" }}
              />
              <Area
                type="monotone"
                dataKey="pm10"
                name="PM10"
                stroke="#f0a326"
                strokeWidth={2}
                fill="url(#pm10Fill)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
