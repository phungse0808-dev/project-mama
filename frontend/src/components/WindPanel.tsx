import { useEffect, useState } from "react";
import { api } from "../api";
import type { Wind } from "../api";

type Props = { province: string };

/** ความสูงของแท่งเป็นร้อยละ เทียบกับลมแรงสุดในช่วงที่แสดง
 *
 * เทียบกับค่าสูงสุดของชุดนี้ ไม่ใช่ค่าคงที่ตายตัว
 * เพราะลมในไทยต่างกันหลายเท่าระหว่างวันที่สงบกับวันที่มีพายุ
 * ถ้าตรึงเพดานไว้ที่ค่าเดียว วันที่ลมอ่อนทั้งวันจะได้แท่งเตี้ยติดพื้นจนดูไม่ออกว่าต่างกัน
 *
 * เว้นขั้นต่ำไว้สี่ ชั่วโมงที่ลมเกือบนิ่งจึงยังเห็นเป็นแท่ง ไม่ใช่หายไปเฉย ๆ
 */
function barHeight(speed: number, peak: number): number {
  return Math.max(4, (speed / (peak || 1)) * 100);
}

/**
 * ลมกับการพัดฝุ่น
 *
 * ทำไมแผงนี้อยู่ในระบบเฝ้าระวังฝุ่น
 *     ลมเป็นตัวพาฝุ่นออกจากพื้นที่ ช่วงที่ลมอ่อนอากาศแทบไม่ถ่ายเท
 *     ฝุ่นที่ปล่อยออกมาจึงค้างอยู่ที่เดิมและสะสมขึ้นเรื่อย ๆ
 *     รู้ล่วงหน้าว่าคืนนี้ลมจะสงบ ก็พอจะเดาได้ว่าพรุ่งนี้เช้าอากาศน่าจะแย่กว่าวันนี้
 *
 * ทำไมเป็นค่าปัจจุบันกับพยากรณ์ ไม่ใช่การวิเคราะห์ย้อนหลัง
 *     ข้อมูลลมย้อนหลังที่ระบบเก็บมาจาก NASA POWER ซึ่งตามหลังปัจจุบันหลายสัปดาห์
 *     ส่วนค่าฝุ่นเพิ่งเริ่มเก็บกลางเดือนสิงหาคม สองชุดทับกันแค่วันเดียว
 *     ยังคำนวณความสัมพันธ์ระหว่างลมกับฝุ่นจากข้อมูลของระบบเองไม่ได้
 *     จึงบอกได้แค่ว่าลมเป็นอย่างไร ไม่ได้บอกว่าฝุ่นจะเป็นเท่าไร
 */
export function WindPanel({ province }: Props) {
  const [wind, setWind] = useState<Wind | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWind(null);

    const load = async () => {
      try {
        const result = await api.wind(province, 24);
        if (!cancelled) setWind(result);
      } catch {
        if (!cancelled) setWind({ available: false, reason: "เรียกข้อมูลลมไม่สำเร็จ" });
      }
    };

    void load();

    // ดึงซ้ำทุกสิบนาที ให้ค่าบนจอตามความจริงโดยไม่ต้องรีเฟรชหน้าเอง
    //
    // ทำไมสิบนาที ไม่ถี่กว่านี้
    //     ต้นทางอัปเดตค่าทุกสิบห้านาที และฝั่งเซิร์ฟเวอร์เก็บผลไว้ใช้ซ้ำสิบนาที
    //     ถามถี่กว่านี้จึงได้ค่าเดิมกลับมา แลกกับการยิงคำขอเพิ่มโดยไม่ได้อะไร
    const timer = setInterval(() => void load(), 10 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [province]);

  if (!wind) {
    return (
      <section className="panel">
        <h2 className="panel-title">
          ลมกับการพัดฝุ่น<span className="panel-hint">กำลังโหลด</span>
        </h2>
      </section>
    );
  }

  if (!wind.available) {
    return (
      <section className="panel">
        <h2 className="panel-title">ลมกับการพัดฝุ่น</h2>
        <p className="wind-empty">{wind.reason ?? "ไม่มีข้อมูลลมของพื้นที่นี้"}</p>
      </section>
    );
  }

  const hourly = wind.hourly ?? [];
  const peak = hourly.reduce((high, point) => Math.max(high, point.wind_speed), 0);
  const levels = wind.levels ?? [];

  // ตำแหน่งเข็มบนแถบระดับ คิดเป็นร้อยละของความกว้างทั้งแถบ
  //
  // ทุกระดับกินความกว้างเท่ากันบนแถบ แม้ช่วงตัวเลขจริงจะกว้างไม่เท่ากัน
  // เพราะระดับสุดท้ายไม่มีขอบบน ถ้าวางตามสัดส่วนตัวเลขจริงจะวางไม่ได้เลย
  const speed = wind.wind_speed ?? 0;
  const index = levels.findIndex(
    (level) => level.upper_kmh === null || speed < level.upper_kmh,
  );
  const band = index < 0 ? levels.length - 1 : index;
  const floor = band === 0 ? 0 : (levels[band - 1].upper_kmh ?? 0);
  const ceiling = levels[band]?.upper_kmh;
  const within =
    ceiling === null || ceiling === undefined
      ? 0.5
      : Math.min(1, Math.max(0, (speed - floor) / (ceiling - floor)));
  const markerPct = levels.length
    ? ((band + within) / levels.length) * 100
    : 50;

  return (
    <section className="panel wind">
      <h2 className="panel-title">
        ลมกับการพัดฝุ่น
        <span className="panel-hint">
          {wind.province} · {wind.source}
          {wind.minutes_behind != null ? ` · ${wind.minutes_behind} นาทีที่แล้ว` : ""}
        </span>
      </h2>

      <div className="wind-now">
        <div>
          <p className="wind-value">
            {speed.toFixed(1)}
            <span className="wind-unit">km/h</span>
          </p>
          <p className="wind-detail">
            {wind.wind_direction_th ? `ลมจากทิศ${wind.wind_direction_th} ` : ""}
            {wind.wind_direction != null ? `${Math.round(wind.wind_direction)}°` : ""}
            {wind.wind_gusts != null ? ` · ลมกระโชกแรงสุด ${wind.wind_gusts} km/h` : ""}
          </p>
        </div>

        {/* เข็มทิศชี้ทิศที่ลมพัดไป ส่วนตัวเลของศาบอกทิศที่ลมพัดมาจาก
            สองอย่างนี้ตรงข้ามกันเสมอ จึงหมุนเพิ่มอีกร้อยแปดสิบองศา
            คนอ่านเข้าใจลูกศรที่ชี้ตามทางลมได้ทันที ต่างจากลูกศรที่ชี้ย้อนทาง */}
        <svg className="wind-compass" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" className="wind-compass-face" />
          <text x="60" y="18" textAnchor="middle">
            N
          </text>
          <text x="106" y="64" textAnchor="middle">
            E
          </text>
          <text x="60" y="110" textAnchor="middle">
            S
          </text>
          <text x="14" y="64" textAnchor="middle">
            W
          </text>
          {wind.wind_direction != null && (
            <g transform={`rotate(${wind.wind_direction + 180} 60 60)`}>
              <line x1="60" y1="86" x2="60" y2="36" className="wind-arrow" />
              <path d="M60 28 L67 43 L60 39 L53 43 Z" className="wind-arrow-head" />
            </g>
          )}
          <circle cx="60" cy="60" r="4" className="wind-compass-pin" />
        </svg>
      </div>

      {/* แถบระดับความแรงลม ใช้มาตราโบฟอร์ตซึ่งเป็นมาตรฐานสากล
          ไม่ได้ตั้งเกณฑ์เอง ด้วยเหตุผลเดียวกับที่ระดับคุณภาพอากาศใช้เกณฑ์ราชการ */}
      {levels.length > 0 && (
        <div className="wind-scale">
          <div className="wind-scale-bar">
            {levels.map((level, position) => (
              <i
                key={level.key}
                style={{ opacity: 0.25 + (position / (levels.length - 1)) * 0.75 }}
              />
            ))}
          </div>
          <div className="wind-scale-mark">
            <span style={{ left: `${markerPct}%` }}>
              <b>{wind.level?.label_th ?? "-"}</b>
              <small>ตอนนี้</small>
            </span>
          </div>
          <div className="wind-scale-ticks">
            {levels.map((level) => (
              <i key={level.key}>{level.label_th}</i>
            ))}
          </div>
        </div>
      )}

      {hourly.length > 0 && (
        <>
          <p className="wind-section">
            ลม 24 ชั่วโมงข้างหน้า
            <span>
              {wind.calm_hours
                ? `ลมสงบ ${wind.calm_hours} ชั่วโมง` +
                  (wind.calm_run_hours && wind.calm_from
                    ? ` · ติดกันยาวสุด ${wind.calm_run_hours} ชั่วโมง ${wind.calm_from}–${wind.calm_to} น.`
                    : "")
                : `ไม่มีชั่วโมงที่ลมต่ำกว่า ${wind.calm_threshold_kmh} km/h`}
            </span>
          </p>

          <div className="wind-bars">
            {hourly.map((point) => (
              <span
                key={point.time}
                className={point.calm ? "wind-bar calm" : "wind-bar"}
                style={{ height: `${barHeight(point.wind_speed, peak)}%` }}
                title={`${point.label} น. · ${point.wind_speed} km/h${point.calm ? " · ลมสงบ" : ""}`}
              />
            ))}
          </div>
          {/* ป้ายเวลาทุกหกชั่วโมงพอ ถ้าใส่ครบยี่สิบสี่จะเบียดกันจนอ่านไม่ออก */}
          <div className="wind-bars-axis">
            {hourly.map((point, position) => (
              <i key={point.time}>{position % 6 === 0 ? point.label : ""}</i>
            ))}
          </div>
        </>
      )}

      {/* ข้อจำกัดต้องอยู่ในหน้า ไม่ใช่อยู่แต่ในเอกสาร
          คนที่เห็นแผงนี้ต้องรู้ว่าอะไรวัดมาจริงและอะไรเป็นการตีความ */}
      <p className="wind-note">
        ตัวเลขลมทั้งหมดเป็นค่าจริงจาก {wind.source} ส่วนการบอกว่าลมอ่อนทำให้ฝุ่นสะสม
        อ้างอิงหลักอุตุนิยมวิทยาทั่วไป ไม่ได้พิสูจน์จากข้อมูลของระบบนี้เอง
        เพราะข้อมูลลมย้อนหลังกับข้อมูลฝุ่นที่เก็บไว้ทับกันเพียงวันเดียว
        แผงนี้จึงบอกว่าลมเป็นอย่างไร ไม่ได้บอกว่าค่าฝุ่นจะเป็นเท่าไร
      </p>
    </section>
  );
}
