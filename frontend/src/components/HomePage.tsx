import { useEffect, useState } from "react";
import { api } from "../api";
import type { Summary, WeatherNow, Wind } from "../api";
import { DiseaseRisk } from "./DiseaseRisk";
import { WeatherIcon } from "./WeatherIcon";

type Props = {
  summary: Summary | null;
  onOpenAir: () => void;
  /** จังหวัดที่ใช้แสดงสภาพอากาศ ว่างได้ จะตกไปใช้ค่าตั้งต้น */
  province: string | null;
  provinces: string[];
  /** พื้นที่ที่เลือกดู ค่าว่างแปลว่าทั้งประเทศ */
  area: string;
  onAreaChange: (area: string) => void;
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
export function HomePage({
  summary,
  onOpenAir,
  province,
  provinces,
  area,
  onAreaChange,
}: Props) {
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [wind, setWind] = useState<Wind | null>(null);

  // จังหวัดที่ใช้ดึงอากาศ เรียงลำดับความสำคัญจากที่เจาะจงที่สุดลงมา
  //
  // เลือกไว้ > จังหวัดในโปรไฟล์ > ค่าตั้งต้น
  // เพราะอากาศต้องเจาะจงจังหวัดเสมอ ไม่มีตัวเลือกทั้งประเทศให้ตกไปใช้
  const target = area || province || DEFAULT_PROVINCE;

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

  // ดึงลมของจังหวัดเดียวกันกับอากาศ ใช้จังหวะเดียวกันด้วย
  //
  // แยก effect ออกจากอากาศเพราะเป็นคนละเส้นทาง ถ้าเส้นใดเส้นหนึ่งล่ม
  // อีกเส้นต้องยังแสดงได้ตามปกติ ไม่ใช่หายไปทั้งคู่
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.wind(target, 24);
        if (!cancelled) setWind(result);
      } catch {
        if (!cancelled) setWind(null);
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
  const air = wind?.available ? wind : null;

  return (
    <div className="home-entry">
      {/* วางช่องเลือกไว้นอกการ์ด ไม่ใช่ในหัวการ์ดเหมือนหน้าฝุ่น
          เพราะการ์ดใบนี้เป็นปุ่มทั้งใบ ถ้าเอาช่องเลือกไปไว้ข้างใน
          การกดเลือกจะไปโดนปุ่มดักก่อนจนเปลี่ยนหน้าแทนที่จะเปิดรายการ
          และปุ่มซ้อนในปุ่มยังเป็นโครงสร้างที่ไม่ถูกต้องด้วย */}
      <div className="home-head">
        <label className="card-group-picker">
          <span className="sr-only">เลือกพื้นที่ที่ต้องการดู</span>
          <select value={area} onChange={(event) => onAreaChange(event.target.value)}>
            <option value="">ทั้งประเทศ</option>
            {provinces.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button className="panel home-card" onClick={onOpenAir}>
        <h2 className="home-card-title">วัดคุณภาพอากาศ</h2>
        <p className="home-card-detail">
          ค่าฝุ่นล่าสุดทุกสถานี แผนที่ อันดับจังหวัด กราฟย้อนหลัง
          คำแนะนำที่ตรงกับตัวคุณ และผลกระทบต่อสุขภาพ
        </p>

        {/* สามกลุ่มเรียงเป็นสามคอลัมน์ ไม่ใช่ซ้อนกันลงมา
            เดิมแต่ละกลุ่มกินเต็มความกว้าง ได้ช่องกว้างหกร้อยพิกเซล
            สำหรับตัวเลขสี่ตัว พื้นที่ว่างจึงมากกว่าตัวเนื้อหา และการ์ดสูงเกือบห้าร้อย

            ยังต้องแบ่งกลุ่มอยู่ เพราะขอบเขตของตัวเลขต่างกัน
            ค่าฝุ่นเป็นภาพรวมทั้งประเทศ ส่วนอากาศกับลมเป็นของจังหวัดเดียว
            ถ้าเรียงหกช่องรวดจะเข้าใจผิดว่าอุณหภูมิเป็นค่าเฉลี่ยทั้งประเทศด้วย */}
        <div className="home-cols">
          {/* อ่านขอบเขตจากคำตอบของเซิร์ฟเวอร์ ไม่ใช่จากค่าที่เลือกไว้
              เพราะระหว่างที่คำขอใหม่ยังไม่กลับมา ตัวเลขบนจอยังเป็นของขอบเขตเดิม */}
          <div className="home-col dust">
            <p className="home-col-head">
              เรื่องของฝุ่น<span>{summary?.province ?? "ทั้งประเทศ"}</span>
            </p>

            <p className="home-col-value">
              {summary?.pm25_avg ?? "—"}
              <span className="home-col-unit">µg/m³</span>
            </p>
            <p className="home-col-note">
              {summary?.province ? "เฉลี่ยในจังหวัด" : "เฉลี่ยทั้งประเทศ"}
              {summary?.level ? ` · ระดับ${summary.level.label_th}` : ""}
            </p>

            <p className="home-col-sub">
              <strong>{summary?.pm25_max ?? "—"}</strong>
              สูงสุด{summary?.worst_station ? ` · ${summary.worst_station.province}` : ""}
            </p>
          </div>

          {/* ซ่อนทั้งคอลัมน์เมื่อดึงอากาศไม่ได้ ไม่ใช่แสดงขีดกลาง
              เพราะช่องว่างเรียงกันดูเหมือนระบบพัง ส่วนการหายไปเงียบ ๆ
              ยังเหลือคอลัมน์ฝุ่นที่ใช้งานได้ตามปกติ */}
          {now && (
            <div className="home-col weather">
              <p className="home-col-head">
                สภาพอากาศ<span>{now.province ?? target}</span>
              </p>

              <div className="home-col-main">
                <WeatherIcon code={now.weather_code} size={30} />
                <div>
                  <p className="home-col-value">
                    {now.temperature ?? "—"}
                    <span className="home-col-unit">°C</span>
                  </p>
                  <p className="home-col-note">{now.condition}</p>
                </div>
              </div>

              <p className="home-col-sub">
                <strong>{now.rain_chance_pct ?? "—"}%</strong>
                โอกาสฝนตกวันนี้
              </p>
            </div>
          )}

          {air && (
            <div className="home-col wind">
              <p className="home-col-head">
                ลม<span>{air.province ?? target}</span>
              </p>

              <div className="home-col-main">
                {/* เข็มทิศชี้ทิศที่ลมพัดไป ส่วนองศาที่ต้นทางส่งมาคือทิศที่ลมพัดมาจาก
                    สองอย่างนี้ตรงข้ามกันเสมอ จึงหมุนเพิ่มอีกร้อยแปดสิบองศา */}
                <svg className="home-wind-dial" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="17" />
                  {air.wind_direction != null && (
                    <g transform={`rotate(${air.wind_direction + 180} 20 20)`}>
                      <line x1="20" y1="29" x2="20" y2="13" />
                      <path d="M20 9 L24 17 L20 15 L16 17 Z" />
                    </g>
                  )}
                </svg>
                <div>
                  <p className="home-col-value">
                    {air.wind_speed ?? "—"}
                    <span className="home-col-unit">km/h</span>
                  </p>
                  <p className="home-col-note">
                    {air.level?.label_th ?? "ไม่ทราบระดับ"}
                    {air.wind_direction_th ? ` · จากทิศ${air.wind_direction_th}` : ""}
                  </p>
                </div>
              </div>

              {/* ไม่มีชั่วโมงลมสงบเป็นข่าวดี ไม่ใช่ตัวเลขที่ต้องเน้น
                  เดิมแสดงเลขศูนย์ตัวใหญ่เท่าค่าอื่น ซึ่งอ่านเหมือนมีอะไรผิดปกติ
                  จึงเปลี่ยนเป็นประโยคบอกเล่าเมื่อไม่มี และเน้นตัวเลขเฉพาะตอนที่มีจริง */}
              <p className="home-col-sub">
                {air.calm_hours ? (
                  <>
                    <strong>{air.calm_hours} ชม.</strong>
                    ลมสงบใน 24 ชม. · ช่วงที่ฝุ่นสะสม
                  </>
                ) : (
                  "อีก 24 ชม. ไม่มีช่วงลมสงบ อากาศถ่ายเทตลอด"
                )}
              </p>
            </div>
          )}
        </div>

        <span className="home-card-go">เข้าดูข้อมูล →</span>
      </button>

      {/* วางไว้หน้าหลักเพราะตอบคำถามว่าตัวเลขที่เห็นแปลว่าอะไร
          ซึ่งเป็นสิ่งแรกที่คนเปิดมาอยากรู้ ก่อนจะกดเข้าไปดูรายละเอียด */}
      <DiseaseRisk summary={summary} />
    </div>
  );
}
