import { useEffect, useState } from "react";
import { api } from "../api";
import type { Pm25Forecast } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string | null;
};

type StationOption = { station_code: string; name_th: string; hours: number; pm25_avg: number };

/** รายชื่อสถานีของจังหวัดล่าสุดที่โหลดสำเร็จ กันช่องเลือกว่างจนกดกลับไม่ได้ */
let knownStations: StationOption[] = [];

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
  // รหัสสถานีที่เจาะจง ค่าว่างแปลว่าเฉลี่ยทุกสถานีในจังหวัด
  //
  // ค่าภายในจังหวัดเดียวกันต่างกันได้หลายเท่า ค่าเฉลี่ยรวมจึงไม่ตรงกับที่ไหนเลย
  // การเลือกสถานีที่ใกล้ตัวที่สุดให้ค่าที่ใช้ตัดสินใจได้จริงมากกว่า
  const [station, setStation] = useState("");
  const [data, setData] = useState<Pm25Forecast | null>(null);
  const [loading, setLoading] = useState(true);

  // ดึงใหม่เป็นระยะ ไม่ใช่ครั้งเดียวตอนเปิดหน้า
  //
  // ค่าชดเชยคำนวณจากค่าที่สถานีวัดได้จริง ซึ่งเพิ่มขึ้นทุกชั่วโมง
  // ทุกชั่วโมงที่เก็บได้เพิ่มทำให้ค่าชดเชยแม่นขึ้น ถ้าดึงครั้งเดียวแล้วทิ้งไว้
  // ผู้ใช้ที่เปิดหน้าค้างจะเห็นค่าที่คำนวณจากข้อมูลเก่าตลอด
  //
  // ตั้งสิบนาทีให้เท่ากับอายุของข้อมูลที่ฝั่งเซิร์ฟเวอร์เก็บไว้ใช้ซ้ำ
  // ถี่กว่านี้จะได้คำตอบเดิมกลับมาโดยไม่ได้อะไรเพิ่ม
  useEffect(() => {
    if (!province) return;
    let cancelled = false;

    const load = async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      try {
        const result = await api.pm25Forecast(province, station || null);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    void load(true);
    // ดึงรอบต่อไปไม่ต้องขึ้นข้อความกำลังโหลด เพราะมีข้อมูลเดิมแสดงอยู่แล้ว
    // การล้างหน้าจอทิ้งทุกสิบนาทีรบกวนคนที่กำลังอ่านอยู่
    const timer = setInterval(() => void load(false), 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [province, station]);

  // เก็บรายชื่อสถานีไว้แยกจากผลลัพธ์
  //
  // เพราะเมื่อเจาะจงสถานีแล้ว คำตอบที่ได้กลับมายังมีรายชื่อครบเหมือนเดิม
  // แต่ถ้าสถานีนั้นข้อมูลไม่พอจนคำตอบว่าง ช่องเลือกจะว่างตามไปด้วย
  // ผู้ใช้จะเลือกกลับไปสถานีอื่นไม่ได้ กลายเป็นทางตัน
  const fresh = data?.accuracy?.stations;
  if (fresh && fresh.length > 0) knownStations = fresh;
  const stations: StationOption[] = fresh && fresh.length > 0 ? fresh : knownStations;

  const header = (
    <>
      <h2 className="panel-title">
        พยากรณ์ฝุ่นล่วงหน้า 3 วัน
        <span className="panel-hint">จากแบบจำลอง ไม่ใช่ค่าที่ระบบคำนวณเอง</span>
      </h2>
      <div className="weather-controls">
        <label>
          จังหวัด
          <select
            value={province}
            onChange={(event) => {
              setProvince(event.target.value);
              // ล้างสถานีที่เลือกไว้ เพราะเป็นสถานีของจังหวัดเดิม
              setStation("");
            }}
          >
            {provinces.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {stations.length > 1 && (
          <label>
            สถานี
            <select value={station} onChange={(event) => setStation(event.target.value)}>
              <option value="">ทุกสถานีในจังหวัด (ค่าเฉลี่ย)</option>
              {stations.map((item) => (
                <option key={item.station_code} value={item.station_code}>
                  {item.name_th}
                </option>
              ))}
            </select>
          </label>
        )}
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

      {data.adjusted && data.accuracy?.available && (
        <div className="calibration">
          <p className="calibration-title">
            {data.station_code
              ? "ปรับค่าด้วยข้อมูลที่สถานีนี้วัดได้จริงแล้ว"
              : "ปรับค่าด้วยข้อมูลที่สถานีในจังหวัดนี้วัดได้จริงแล้ว"}
          </p>
          <div className="calibration-stats">
            <div>
              <p className="calibration-value">
                {data.station_code ? 1 : data.accuracy.station_count}
              </p>
              <p className="calibration-label">สถานีที่ร่วมคำนวณ</p>
            </div>
            <div>
              <p className="calibration-value">{data.accuracy.hours}</p>
              <p className="calibration-label">ชั่วโมงที่นำมาเทียบ</p>
            </div>
            <div>
              <p className="calibration-value">{data.accuracy.model_avg}</p>
              <p className="calibration-label">แบบจำลองเคยทำนาย</p>
            </div>
            <div>
              <p className="calibration-value">{data.accuracy.measured_avg}</p>
              <p className="calibration-label">สถานีวัดได้จริง</p>
            </div>
            <div>
              <p className="calibration-value">
                {data.accuracy.bias != null && data.accuracy.bias > 0 ? "+" : ""}
                {data.accuracy.bias}
              </p>
              <p className="calibration-label">ค่าคลาดเคลื่อนเฉลี่ย</p>
            </div>
          </div>
          <p className="calibration-note">
            {data.accuracy.bias != null && data.accuracy.bias < 0
              ? `แบบจำลองทำนายต่ำกว่าที่วัดได้จริงเฉลี่ย ${Math.abs(data.accuracy.bias)} µg/m³ อย่างสม่ำเสมอ`
              : `แบบจำลองทำนายสูงกว่าที่วัดได้จริงเฉลี่ย ${data.accuracy.bias} µg/m³ อย่างสม่ำเสมอ`}
            {" "}ระบบจึงชดเชยค่านี้คืนให้ทุกตัวเลขด้านล่าง ตัวเลขที่แสดงจึงเป็นค่าที่ปรับ
            ด้วยข้อมูลของพื้นที่นี้แล้ว ไม่ใช่ค่าดิบจากแบบจำลอง
          </p>

          {data.accuracy.stations && data.accuracy.stations.length > 0 && (
            <details className="station-list">
              <summary>
                ดูค่าเฉลี่ยรายสถานีทั้ง {data.accuracy.station_count} แห่ง
                {data.accuracy.stations.length > 1 && (
                  <span className="station-spread">
                    {" "}· ต่างกัน {data.accuracy.stations[0].pm25_avg} ถึง{" "}
                    {data.accuracy.stations[data.accuracy.stations.length - 1].pm25_avg} µg/m³
                  </span>
                )}
              </summary>
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>สถานี</th>
                    <th style={{ textAlign: "right" }}>เฉลี่ย</th>
                    <th style={{ textAlign: "right" }}>ชั่วโมง</th>
                  </tr>
                </thead>
                <tbody>
                  {data.accuracy.stations.map((station) => (
                    <tr key={station.name_th}>
                      <td>{station.name_th}</td>
                      <td style={{ textAlign: "right" }}>{station.pm25_avg}</td>
                      <td style={{ textAlign: "right" }}>{station.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* ความต่างภายในจังหวัดเดียวกันเป็นข้อจำกัดที่ต้องบอก
                  เพราะแบบจำลองให้ค่าเดียวต่อจังหวัด แต่ของจริงไม่เท่ากันทั้งจังหวัด */}
              <p className="station-note">
                ค่าที่ใช้เทียบเป็นค่าเฉลี่ยของทุกสถานีข้างต้น
                ความต่างระหว่างสถานีในจังหวัดเดียวกันเป็นข้อจำกัดที่แก้ไม่ได้
                เพราะแบบจำลองให้ค่าเดียวต่อหนึ่งพิกัด แต่ของจริงไม่เท่ากันทั้งจังหวัด
              </p>
            </details>
          )}

        </div>
      )}

      <div className="forecast-list">
        {days.map((day, index) => (
          <article key={day.day} className={day.is_today ? "forecast-row today" : "forecast-row"}>
            <span className="forecast-bar" style={{ backgroundColor: day.level.color }} />

            <div className="forecast-when">
              <p className="forecast-day">{DAY_LABELS[index] ?? shortDate(day.day)}</p>
              <p className="forecast-date">{shortDate(day.day)}</p>
              {/* บอกให้ชัดว่าตัวเลขวันนั้นมาจากของจริงหรือการคาดการณ์
                  เพราะสองอย่างนี้เชื่อถือได้ไม่เท่ากัน */}
              <p className={day.measured_hours > 0 ? "forecast-tag real" : "forecast-tag"}>
                {day.measured_hours === 0
                  ? "คาดการณ์"
                  : day.is_measured
                    ? "วัดจริง"
                    : `วัดจริง ${day.measured_hours}/${day.hours} ชม.`}
              </p>
            </div>

            <div className="forecast-value">
              <p className="forecast-number">
                {day.pm25_avg}
                <small> µg/m³</small>
              </p>
              <p className="forecast-caption">
                เฉลี่ยทั้งวัน
                {/* ค่าก่อนปรับมีความหมายเฉพาะวันที่ยังเป็นการคาดการณ์ล้วน
                    วันที่ใช้ค่าวัดจริงแล้วไม่ได้ผ่านการชดเชย จะเทียบกันไม่ได้ */}
                {data.adjusted && day.measured_hours === 0
                  ? ` · ก่อนปรับ ${day.pm25_avg_raw}`
                  : ""}
              </p>
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
        วันที่สถานีวัดค่าได้แล้วจะใช้ค่าที่วัดได้จริง ไม่ใช้ค่าคาดการณ์
        เพราะค่าที่วัดได้จริงแม่นกว่าเสมอ เหลือเฉพาะชั่วโมงที่ยังไม่ถึง
        และวันข้างหน้าที่ยังต้องใช้การคาดการณ์
        <br />
        ค่าคาดการณ์ตั้งต้นมาจาก{data.source} ซึ่ง<strong>ระบบไม่ได้คำนวณเอง</strong>
        {data.adjusted
          ? " แต่ระบบนำค่าที่สถานีในจังหวัดนี้วัดได้จริงมาเทียบแล้วชดเชยความคลาดเคลื่อนให้"
          : ""}
        <br />
        ต่างจากค่าฝุ่นในหน้าหลักซึ่งวัดได้จริงจากสถานีของกรมควบคุมมลพิษ
        ค่าในตารางนี้ยังไม่เกิดขึ้นจริงและคลาดเคลื่อนได้
        <br />
        ระบบยังสร้างแบบจำลองพยากรณ์เองทั้งหมดไม่ได้ เพราะฝุ่นในไทยขึ้นกับฤดูกาลอย่างชัดเจน
        ต้องมีข้อมูลย้อนหลังอย่างน้อยหนึ่งปีเต็ม แต่ระบบเพิ่งเริ่มเก็บได้ราวหนึ่งเดือน
        การชดเชยด้วยค่าที่วัดได้จริงจึงเป็นวิธีที่ใช้ข้อมูลเท่าที่มีให้เกิดประโยชน์ที่สุด
        ยิ่งเก็บข้อมูลนานขึ้น การชดเชยจะยิ่งน่าเชื่อถือ
      </p>
    </section>
  );
}
