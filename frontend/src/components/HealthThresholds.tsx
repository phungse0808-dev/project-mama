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

  // รวมกลุ่มที่เริ่มระวังที่ค่าเดียวกันไว้ด้วยกัน
  //
  // สาระของกราฟคือมีบางกลุ่มเริ่มเร็วกว่าคนอื่น การแบ่งหัวข้อให้เห็น
  // ทำให้อ่านออกทันที ต่างจากการเรียงแปดแถวรวดซึ่งต้องไล่อ่านตัวเลขทีละแถว
  const bands: { onset: number; label: string | null; color: string | null; groups: typeof data.groups }[] = [];
  for (const group of data.groups) {
    const last = bands[bands.length - 1];
    if (last && last.onset === group.onset_pm25) last.groups.push(group);
    else
      bands.push({
        onset: group.onset_pm25,
        label: group.level_label_th,
        color: group.color,
        groups: [group],
      });
  }

  // แถบไล่สีของสเกล ประกอบจากขอบของแต่ละระดับ
  //
  // ใช้ hard stop คือจบสีเดิมแล้วเริ่มสีใหม่ที่ตำแหน่งเดียวกัน
  // เพื่อให้เห็นขอบของระดับชัด ไม่ใช่ไล่สีต่อเนื่องจนไม่รู้ว่าเปลี่ยนระดับตรงไหน
  const stops = data.levels
    .map((level, index) => {
      const from = pos(level.floor);
      const next = data.levels[index + 1];
      const to = next ? pos(next.floor) : 100;
      return `${level.color} ${from}%, ${level.color} ${to}%`;
    })
    .join(", ");

  return (
    <section className="panel threshold">
      <h2 className="panel-title">
        ค่าฝุ่นเท่าไหร่ เริ่มกระทบใคร
        <span className="panel-hint">จุดขาวคือค่าตอนนี้ · แถบเริ่มตรงจุดที่ควรเริ่มระวัง</span>
      </h2>

      {/* แถบสเกลใช้ทรงเดียวกับแถบช่วงอุณหภูมิในการ์ดสภาพอากาศ
          ทั้งความหนา ความมน จุดขาวขอบเข้ม และแสงเรือง
          เพื่อให้ทั้งเว็บพูดภาษาภาพเดียวกัน */}
      <div className="threshold-scale" style={{ backgroundImage: `linear-gradient(90deg, ${stops})` }}>
        {current != null && (
          <span className="threshold-dot" style={{ left: `${pos(current)}%` }} aria-hidden="true" />
        )}
      </div>

      <div className="threshold-ticks" aria-hidden="true">
        {data.levels.slice(1).map((level) => (
          <span key={level.key} style={{ left: `${pos(level.floor)}%`, color: level.color }}>
            {level.floor}
          </span>
        ))}
        <span className="threshold-tick-end">{AXIS_MAX}+</span>
      </div>

      {bands.map((band) => {
        const reached = current != null && current >= band.onset;
        return (
          <div key={band.onset} className="threshold-band">
            <p className={reached ? "threshold-band-head reached" : "threshold-band-head"}>
              <span className="threshold-band-dot" style={{ background: band.color ?? undefined }} />
              เริ่มระวังตั้งแต่ {band.onset} · ระดับ{band.label}
              {reached ? " · ผ่านจุดนี้แล้ว" : ""}
            </p>

            <ul className="threshold-rows">
              {band.groups.map((group) => {
                const start = pos(group.onset_pm25);
                return (
                  <li key={group.key} className={reached ? "threshold-row hit" : "threshold-row"}>
                    <span className="threshold-name">{group.label_th}</span>
                    <span className="threshold-track">
                      <span
                        className="threshold-bar"
                        style={{
                          left: `${start}%`,
                          width: `${100 - start}%`,
                          // จางไปทางขวาเพราะปลายขวาคือค่าที่สูงมากซึ่งเกิดไม่บ่อย
                          // การไล่จางบอกเป็นนัยว่ายิ่งไปทางขวายิ่งห่างจากความจริง
                          backgroundImage: `linear-gradient(90deg, ${group.color}d9, ${group.color}1f)`,
                        }}
                      />
                      {current != null && (
                        <span className="threshold-now" style={{ left: `${pos(current)}%` }} />
                      )}
                    </span>
                    <span className="threshold-value">{group.onset_pm25}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <p className="threshold-note">
        {current == null ? (
          "ยังไม่มีค่าฝุ่นปัจจุบัน"
        ) : affected === 0 ? (
          <>
            ตอนนี้ <strong>{current}</strong> ยังไม่ถึงจุดที่กลุ่มไหนต้องระวัง
            <span className="threshold-gap">
              {" "}
              · ห่างจากกลุ่มแรก {(bands[0].onset - current).toFixed(1)}
            </span>
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
