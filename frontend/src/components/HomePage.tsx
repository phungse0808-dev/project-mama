import { useEffect, useState } from "react";
import { api } from "../api";
import type { Summary, WeatherNow } from "../api";
import { WeatherIcon } from "./WeatherIcon";

type Props = {
  summary: Summary | null;
  onOpenAir: () => void;
  /** จังหวัดที่ใช้แสดงสภาพอากาศ ว่างได้ จะตกไปใช้ค่าตั้งต้น */
  province: string | null;
};

/** จังหวัดที่ใช้เมื่อผู้ใช้ยังไม่ได้ตั้ง
 *
 * ต้องมีค่าตั้งต้นเพราะสภาพอากาศต้องเจาะจงจังหวัดเสมอ
 * ต่างจากค่าฝุ่นที่ค่าเฉลี่ยทั้งประเทศยังมีความหมายในตัวเอง
 * ส่วนอุณหภูมิเฉลี่ยของทั้งประเทศไม่ได้บอกอะไรกับใคร
 */
const DEFAULT_PROVINCE = "กรุงเทพฯ";

/**
 * หน้าหลัก
 *
 * ทำหน้าที่เป็นทางเข้า แทนที่จะพาเข้าหน้าข้อมูลทันทีหลังเข้าระบบ
 *
 * ข้อดีคือทางเข้ามีที่ให้บอกว่าข้างในมีอะไรและตอนนี้ค่าเป็นเท่าไร
 * ผู้ใช้จึงเห็นภาพรวมก่อนกดเข้าไปดูรายละเอียด
 */
export function HomePage({ summary, onOpenAir, province }: Props) {
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const target = province || DEFAULT_PROVINCE;

  // ดึงสภาพอากาศของจังหวัดที่เลือก
  //
  // ต้นทางอัปเดตทุก 15 นาที จึงดึงซ้ำทุก 10 นาทีก็เพียงพอ
  // ใช้จังหวะเดียวกับที่หน้าฝุ่นใช้ จะได้ไม่มีสองจังหวะให้สับสน
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.weatherNow(target);
        if (!cancelled) setWeather(result);
      } catch {
        if (!cancelled) setWeather(null);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [target]);

  const now = weather?.available ? weather : null;

  return (
    <div className="home-entry">
      <button className="panel home-card" onClick={onOpenAir}>
        <h2 className="home-card-title">วัดคุณภาพอากาศ</h2>
        <p className="home-card-detail">
          ค่าฝุ่นล่าสุดทุกสถานี แผนที่ อันดับจังหวัด กราฟย้อนหลัง
          คำแนะนำที่ตรงกับตัวคุณ และผลกระทบต่อสุขภาพ
        </p>

        {/* แบ่งเป็นสองกลุ่มเพราะขอบเขตของตัวเลขต่างกัน
            ค่าฝุ่นเป็นภาพรวมทั้งประเทศ ส่วนอากาศเป็นของจังหวัดเดียว
            ถ้าวางเรียงกันหกช่องรวดจะเข้าใจผิดว่าอุณหภูมิเป็นค่าเฉลี่ยทั้งประเทศด้วย */}
        <p className="home-group">
          <span className="home-group-bar dust" />
          เรื่องของฝุ่น · ทั้งประเทศ
        </p>

        <div className="home-stats">
          <div>
            <p className="home-stat-value">{summary?.pm25_avg ?? "—"}</p>
            <p className="home-stat-label">
              µg/m³ เฉลี่ยทั้งประเทศ
              {summary?.level ? ` · ระดับ${summary.level.label_th}` : ""}
            </p>
          </div>
          <div>
            <p className="home-stat-value">{summary?.stations_reporting ?? "—"}</p>
            <p className="home-stat-label">สถานีที่รายงานข้อมูล</p>
          </div>
          <div>
            <p className="home-stat-value">{summary?.pm25_max ?? "—"}</p>
            <p className="home-stat-label">
              สูงสุด{summary?.worst_station ? ` · ${summary.worst_station.province}` : ""}
            </p>
          </div>
        </div>

        {/* ซ่อนทั้งกลุ่มเมื่อดึงอากาศไม่ได้ ไม่ใช่แสดงขีดกลางสามช่อง
            เพราะช่องว่างเรียงกันดูเหมือนระบบพัง ส่วนการหายไปเงียบ ๆ
            ยังเหลือส่วนของฝุ่นที่ใช้งานได้ตามปกติ */}
        {now && (
          <>
            <p className="home-group">
              <span className="home-group-bar weather" />
              สภาพอากาศ · {now.province ?? target}
            </p>

            <div className="home-stats">
              <div className="home-weather-now">
                <WeatherIcon code={now.weather_code} size={34} />
                <div>
                  <p className="home-stat-value">
                    {now.temperature ?? "—"}
                    <span className="home-stat-unit"> °C</span>
                  </p>
                  <p className="home-stat-label">{now.condition}</p>
                </div>
              </div>

              <div>
                {now.temp_min != null && now.temp_max != null ? (
                  <p className="home-stat-value">
                    <span className="temp-low">{Math.round(now.temp_min)}</span>
                    <span className="temp-dash">–</span>
                    <span className="temp-high">{Math.round(now.temp_max)}</span>
                    <span className="home-stat-unit"> °C</span>
                  </p>
                ) : (
                  <p className="home-stat-value">—</p>
                )}
                <p className="home-stat-label">ช่วงอุณหภูมิวันนี้</p>
              </div>

              <div>
                <p className="home-stat-value">
                  {now.rain_chance_pct ?? "—"}
                  <span className="home-stat-unit"> %</span>
                </p>
                <p className="home-stat-label">โอกาสฝนตกวันนี้</p>
              </div>
            </div>
          </>
        )}

        <span className="home-card-go">เข้าดูข้อมูล →</span>
      </button>
    </div>
  );
}
