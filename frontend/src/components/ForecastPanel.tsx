import { useEffect, useState } from "react";
import { api } from "../api";
import type { Pm25Forecast } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string | null;
};

/** ชื่อเรียกวันแบบที่คนพูดกันจริง ใช้กับสามวันแรกเท่านั้น */
const DAY_LABELS = ["วันนี้", "พรุ่งนี้", "มะรืนนี้"];

/** ตัดปีออกเหลือแค่วันกับเดือนไทย เพราะพยากรณ์อยู่ในช่วงไม่กี่วันข้างหน้า */
function shortDate(iso: string): string {
  const months = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${months[Number(month) - 1]}`;
}

/**
 * พยากรณ์ฝุ่นล่วงหน้าสามวัน
 *
 * ค่าทั้งหมดมาจากแบบจำลองบรรยากาศภายนอก ระบบนี้ไม่ได้คำนวณเอง
 * จึงเขียนกำกับไว้ทั้งที่หัวข้อและท้ายแผง เพราะเป็นเรื่องที่เข้าใจผิดได้ง่าย
 * และการเคลมว่าระบบพยากรณ์ฝุ่นได้เองทั้งที่ไม่ได้ทำ เป็นปัญหาทางวิชาการ
 *
 * ทำไมยังคำนวณเองไม่ได้
 *     ฝุ่นในไทยขึ้นกับฤดูกาลชัดมาก ต้องมีข้อมูลย้อนหลังอย่างน้อยหนึ่งปีเต็ม
 *     ระบบเพิ่งเริ่มเก็บได้ราวหนึ่งเดือน แบบจำลองที่สร้างจากข้อมูลหน้าฝนอย่างเดียว
 *     จะทำนายหน้าแล้งผิดทั้งหมด
 *
 * แสดงเป็นแถวรายวันแทนกราฟ เพราะสิ่งที่ต้องตัดสินใจคือวันไหนควรระวัง
 * และควรเลี่ยงออกนอกบ้านช่วงไหน ซึ่งอ่านจากตัวเลขตรงกว่ากวาดตาหาจุดสูงสุดบนกราฟ
 */
export function ForecastPanel({ provinces, defaultProvince }: Props) {
  const [province, setProvince] = useState(defaultProvince ?? provinces[0] ?? "");
  const [data, setData] = useState<Pm25Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!province) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await api.pm25Forecast(province);
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
        พยากรณ์ฝุ่นล่วงหน้า 3 วัน
        <span className="panel-hint">จากแบบจำลอง ไม่ใช่ค่าที่ระบบคำนวณเอง</span>
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
        <p className="empty">กำลังโหลดพยากรณ์...</p>
      </section>
    );
  }

  if (!data?.available) {
    return (
      <section className="panel">
        {header}
        <p className="empty">{data?.reason ?? "แสดงพยากรณ์ไม่ได้"}</p>
      </section>
    );
  }

  const days = data.days ?? [];
  const worst = days.reduce(
    (highest, item) => (item.pm25_avg > (highest?.pm25_avg ?? -1) ? item : highest),
    days[0],
  );
  const overStandard = worst && data.standard_th != null && worst.pm25_avg > data.standard_th;
  const overWho = worst && data.guideline_who != null && worst.pm25_avg > data.guideline_who;

  return (
    <section className="panel">
      {header}

      <div className="forecast-list">
        {days.map((day, index) => (
          <article key={day.day} className={day.is_today ? "forecast-row today" : "forecast-row"}>
            <span className="forecast-bar" style={{ backgroundColor: day.level.color }} />

            <div className="forecast-when">
              <p className="forecast-day">{DAY_LABELS[index] ?? shortDate(day.day)}</p>
              <p className="forecast-date">{shortDate(day.day)}</p>
            </div>

            <div className="forecast-value">
              <p className="forecast-number">
                {day.pm25_avg}
                <small> µg/m³</small>
              </p>
              <p className="forecast-caption">เฉลี่ยทั้งวัน</p>
            </div>

            <div className="forecast-detail">
              <p className="forecast-range">
                ช่วง {day.pm25_min} – {day.pm25_max}
              </p>
              {/* เวลาที่ค่าสูงสุดมีประโยชน์กว่าค่าเฉลี่ย เพราะบอกได้ว่าควรเลี่ยงช่วงไหน */}
              <p className="forecast-caption">สูงสุดเวลา {day.peak_at} น.</p>
            </div>

            <span
              className="forecast-level"
              style={{ backgroundColor: `${day.level.color}22`, color: day.level.color }}
            >
              {day.level.label_th}
            </span>
          </article>
        ))}
      </div>

      <p className="weather-note">
        {overStandard
          ? `มีวันที่ค่าเฉลี่ยเกินมาตรฐานไทย ${data.standard_th} µg/m³`
          : `ทุกวันต่ำกว่ามาตรฐานไทย ${data.standard_th} µg/m³`}
        {overWho
          ? ` แต่ยังเกินค่าแนะนำขององค์การอนามัยโลก ${data.guideline_who} µg/m³`
          : ` และต่ำกว่าค่าแนะนำขององค์การอนามัยโลก ${data.guideline_who} µg/m³`}
        <br />
        ค่าพยากรณ์นี้ <strong>ระบบไม่ได้คำนวณเอง</strong> มาจาก{data.source}
        <br />
        ต่างจากค่าฝุ่นในหน้าหลักซึ่งวัดได้จริงจากสถานีของกรมควบคุมมลพิษ
        ค่าในตารางนี้ยังไม่เกิดขึ้นจริงและคลาดเคลื่อนได้
        <br />
        ระบบยังสร้างแบบจำลองพยากรณ์เองไม่ได้ เพราะฝุ่นในไทยขึ้นกับฤดูกาลอย่างชัดเจน
        ต้องมีข้อมูลย้อนหลังอย่างน้อยหนึ่งปีเต็ม แต่ระบบเพิ่งเริ่มเก็บได้ราวหนึ่งเดือน
      </p>
    </section>
  );
}
