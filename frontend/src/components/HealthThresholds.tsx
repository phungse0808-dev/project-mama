import { useEffect, useState } from "react";
import { api } from "../api";
import type { HealthThresholds as Data } from "../api";

type Props = {
  /** ค่าฝุ่นปัจจุบันที่จะขีดเส้นบอกตำแหน่ง ไม่มีก็ไม่ขีด */
  current: number | null;
};

/** ค่าสูงสุดของแกน หน่วยไมโครกรัมต่อลูกบาศก์เมตร
 *
 * หยุดที่ 100 เพราะระดับสูงสุดเริ่มที่ 75 และไม่มีขอบบน
 * ถ้าลากแกนตามค่าที่เคยวัดได้จริงซึ่งบางปีทะลุ 200
 * ช่วง 0 ถึง 37.5 ที่คนอยู่จริงเกือบตลอดปีจะถูกบีบจนอ่านไม่ออก
 */
const AXIS_MAX = 100;

/** แปลงค่าฝุ่นเป็นตำแหน่งร้อยละบนแกน */
function pos(value: number): number {
  return Math.min(100, Math.max(0, (value / AXIS_MAX) * 100));
}

/**
 * กราฟบอกว่าค่าฝุ่นระดับไหนเริ่มกระทบคนกลุ่มไหน
 *
 * ทำไมต้องมี
 *     ตัวเลขค่าฝุ่นอย่างเดียวไม่บอกว่าควรกังวลหรือยัง คนที่เห็นคำว่าดี
 *     มักคิดว่าปลอดภัยกับทุกคน ทั้งที่บางกลุ่มเริ่มได้รับผลกระทบไปแล้ว
 *
 * ค่าจุดเริ่มมาจากไหน
 *     มาจากตารางคำแนะนำสุขภาพที่ระบบใช้อยู่แล้ว โดยดูว่าคำแนะนำของกลุ่มนั้น
 *     เลิกเป็นทำได้ตามปกติครั้งแรกที่ระดับไหน ไม่ได้เป็นข้อมูลทางการแพทย์ชุดใหม่
 *     กราฟจึงพูดตรงกับคำแนะนำที่ผู้ใช้เห็นในหน้าคำแนะนำเสมอ
 */
export function HealthThresholds({ current }: Props) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.healthThresholds();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const affected =
    current == null ? 0 : data.groups.filter((g) => current >= g.onset_pm25).length;

  return (
    <section className="panel threshold">
      <h2 className="panel-title">
        ค่าฝุ่นเท่าไหร่ เริ่มกระทบใคร
        <span className="panel-hint">แถบเริ่มตรงระดับที่คนกลุ่มนั้นเริ่มต้องระวัง</span>
      </h2>

      {/* แถบไล่สีด้านบนใช้สีระดับเดียวกับทั้งเว็บ
          จุดเปลี่ยนสีคือขอบของแต่ละระดับตามเกณฑ์กรมควบคุมมลพิษ */}
      <div className="threshold-scale" aria-hidden="true">
        {data.levels.map((level, index) => {
          const next = data.levels[index + 1];
          const from = pos(level.floor);
          const to = next ? pos(next.floor) : 100;
          return (
            <span
              key={level.key}
              style={{ left: `${from}%`, width: `${to - from}%`, background: level.color }}
            />
          );
        })}
      </div>

      <div className="threshold-ticks" aria-hidden="true">
        {data.levels.slice(1).map((level) => (
          <span key={level.key} style={{ left: `${pos(level.floor)}%` }}>
            {level.floor}
          </span>
        ))}
        <span style={{ left: "100%" }}>{AXIS_MAX}+</span>
      </div>

      <ul className="threshold-rows">
        {data.groups.map((group) => {
          const start = pos(group.onset_pm25);
          const hit = current != null && current >= group.onset_pm25;
          return (
            <li key={group.key} className={hit ? "threshold-row hit" : "threshold-row"}>
              <span className="threshold-name">{group.label_th}</span>
              <span className="threshold-track">
                <span
                  className="threshold-bar"
                  style={{
                    left: `${start}%`,
                    width: `${100 - start}%`,
                    background: group.color ?? "var(--accent)",
                  }}
                />
                {/* เส้นค่าปัจจุบันวาดซ้ำในทุกแถว ไม่ใช่เส้นเดียวลากทับ
                    เพราะแถบของแต่ละแถวมีความสูงต่างกันเมื่อชื่อกลุ่มตัดบรรทัด
                    เส้นเดียวจะไม่ตรงกับแถบทุกแถว */}
                {current != null && (
                  <span className="threshold-now" style={{ left: `${pos(current)}%` }} />
                )}
              </span>
              <span className="threshold-value">{group.onset_pm25}</span>
            </li>
          );
        })}
      </ul>

      <p className="threshold-note">
        {current == null ? (
          "ยังไม่มีค่าฝุ่นปัจจุบัน"
        ) : affected === 0 ? (
          <>
            ตอนนี้ <strong>{current}</strong> ยังไม่ถึงจุดที่กลุ่มไหนต้องระวังเป็นพิเศษ
          </>
        ) : (
          <>
            ตอนนี้ <strong>{current}</strong> ถึงจุดที่ <strong>{affected}</strong> กลุ่ม
            ควรเริ่มระวังแล้ว
          </>
        )}
      </p>

      <p className="threshold-source">
        จุดเริ่มของแต่ละกลุ่มอ่านจากตารางคำแนะนำสุขภาพที่ระบบใช้อยู่ คือระดับที่คำแนะนำ
        เปลี่ยนจากทำได้ตามปกติเป็นให้เฝ้าระวัง ไม่ใช่เกณฑ์วินิจฉัยทางการแพทย์
        ขอบของแต่ละระดับเป็นเกณฑ์ของกรมควบคุมมลพิษ
      </p>
    </section>
  );
}
