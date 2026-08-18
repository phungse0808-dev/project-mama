import { useState } from "react";
import type { Alerts, StationReading } from "../api";

type Props = { alerts: Alerts };

const PREVIEW_COUNT = 8;

/** รายการสถานีที่ค่าฝุ่นเกินเกณฑ์ พร้อมปุ่มดูเพิ่ม */
function StationList({ stations }: { stations: StationReading[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? stations : stations.slice(0, PREVIEW_COUNT);

  return (
    <>
      <ul className="alert-list">
        {shown.map((station) => (
          <li key={station.station_code}>
            <span className="alert-dot" style={{ background: station.level.color }} />
            <span className="alert-name">
              {station.name_th}
              <small>จังหวัด{station.province}</small>
            </span>
            <span className="alert-value">{station.pm25}</span>
          </li>
        ))}
      </ul>
      {stations.length > PREVIEW_COUNT && (
        <button className="link-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "ย่อรายการ" : `ดูทั้งหมด ${stations.length} สถานี`}
        </button>
      )}
    </>
  );
}

/**
 * แผงแจ้งเตือนพื้นที่ที่ค่าฝุ่นเกินเกณฑ์
 *
 * แยกเป็นสองระดับเพราะมาตรฐานไทยผ่อนปรนกว่าค่าแนะนำขององค์การอนามัยโลก 2.5 เท่า
 * พื้นที่ที่ยังไม่เกินมาตรฐานไทยจึงอาจเกินเกณฑ์สากลอยู่ ซึ่งมีผลต่อสุขภาพระยะยาว
 * ถ้าแสดงแค่เกณฑ์ไทยอย่างเดียวจะทำให้เข้าใจว่าอากาศปลอดภัยทั้งที่ไม่ใช่
 */
export function AlertPanel({ alerts }: Props) {
  const overThai = alerts.over_thai_standard;
  const overWho = alerts.over_who_guideline;
  const clean = overThai.length === 0 && overWho.length === 0;

  return (
    <section className="panel">
      <h2 className="panel-title">
        การแจ้งเตือนพื้นที่เสี่ยง
        <span className="panel-hint">ตรวจ {alerts.stations_checked} สถานี</span>
      </h2>

      {clean && (
        <p className="alert-clear">
          ขณะนี้ไม่มีพื้นที่ใดที่ค่าฝุ่นเกินเกณฑ์ คุณภาพอากาศอยู่ในระดับที่ปลอดภัยทั่วประเทศ
        </p>
      )}

      <div className="alert-columns">
        <div className={`alert-box ${overThai.length > 0 ? "danger" : "quiet"}`}>
          <p className="alert-heading">
            เกินมาตรฐานประเทศไทย
            <span>มากกว่า {alerts.thai_standard} µg/m³</span>
          </p>
          <p className="alert-count">{overThai.length}<small>สถานี</small></p>
          {overThai.length > 0 ? (
            <StationList stations={overThai} />
          ) : (
            <p className="alert-none">ไม่มีสถานีใดเกินมาตรฐาน</p>
          )}
        </div>

        <div className={`alert-box ${overWho.length > 0 ? "warn" : "quiet"}`}>
          <p className="alert-heading">
            เกินค่าแนะนำองค์การอนามัยโลก
            <span>มากกว่า {alerts.who_guideline} µg/m³</span>
          </p>
          <p className="alert-count">{overWho.length}<small>สถานี</small></p>
          {overWho.length > 0 ? (
            <StationList stations={overWho} />
          ) : (
            <p className="alert-none">ไม่มีสถานีใดเกินค่าแนะนำ</p>
          )}
        </div>
      </div>

      <p className="alert-note">
        มาตรฐานของประเทศไทยกำหนดไว้ที่ {alerts.thai_standard} µg/m³ ซึ่งผ่อนปรนกว่า
        ค่าแนะนำขององค์การอนามัยโลกที่ {alerts.who_guideline} µg/m³ ถึง
        {" "}{(alerts.thai_standard / alerts.who_guideline).toFixed(1)} เท่า
        พื้นที่ที่ไม่เกินมาตรฐานไทยจึงยังอาจส่งผลต่อสุขภาพในระยะยาวได้
      </p>
    </section>
  );
}
