import { useEffect, useState } from "react";
import type { ProtectionLevel } from "../api";
import { api } from "../api";
import { levelInk } from "../levelInk";
import { ProtectIcon } from "./ProtectIcon";

/** ช่วงค่าของระดับ เช่น 0–15 หรือ มากกว่า 75 */
function rangeText(level: ProtectionLevel): string {
  if (level.pm25_to == null) return `มากกว่า ${level.pm25_from}`;
  // ขอบล่างของระดับถัดไปเริ่มที่จุดทศนิยมถัดจากขอบบนของระดับก่อนหน้า
  // ไม่งั้นจะเห็นเลขเดียวกันเป็นทั้งขอบบนและขอบล่าง แล้วอ่านไม่ออกว่าค่าพอดีอยู่ระดับไหน
  const from = level.pm25_from === 0 ? "0" : (level.pm25_from + 0.1).toFixed(1);
  return `${from}–${level.pm25_to}`;
}

/** แผงป้องกันตัวของทุกระดับคุณภาพอากาศ กางให้เห็นพร้อมกัน
 *
 * ต่างจากแถบคำแนะนำในการ์ดฝุ่นที่บอกเฉพาะระดับตอนนี้
 * แผงนี้บอกครบทุกระดับ คนอ่านจึงรู้ล่วงหน้าว่าถ้าฝุ่นขึ้นอีกระดับต้องทำอะไรเพิ่ม
 * ข้อมูลมาจาก backend/app/health_advice.py ชุดเดียวกับที่ใช้ในการ์ด
 */
export function ProtectionLevels() {
  const [levels, setLevels] = useState<ProtectionLevel[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .protectionLevels()
      .then((result) => {
        if (!cancelled) setLevels(result);
      })
      .catch(() => {
        // ดึงไม่สำเร็จก็ซ่อนแผงไปเลย ดีกว่าขึ้นกรอบว่างคาหน้า
        if (!cancelled) setLevels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (levels.length === 0) return null;

  return (
    <section className="panel plevel">
      <h2 className="panel-title">
        ป้องกันตัวอย่างไรในแต่ละระดับ
        <span className="panel-hint">ครบทั้ง 5 ระดับ ดูล่วงหน้าได้ว่าระดับถัดไปต้องทำอะไร</span>
      </h2>

      <ul className="plevel-list">
        {levels.map((level) => (
          <li key={level.key}>
            <div className="plevel-head">
              <span className="plevel-name">
                <span className="plevel-dot" style={{ background: level.color }} aria-hidden="true" />
                {level.label_th}
              </span>
              <span className="plevel-range">{rangeText(level)} µg/m³</span>
            </div>
            <ul className="plevel-items">
              {level.items.map((item) => (
                <li key={item.text_th}>
                  <ProtectIcon name={item.icon} color={levelInk(level.color) ?? "currentColor"} />
                  <span>{item.text_th}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
