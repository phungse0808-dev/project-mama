import { useEffect, useState } from "react";
import { api } from "../api";
import type { DiseaseSummary, Summary } from "../api";

type Props = {
  /** สรุปค่าฝุ่นของพื้นที่ที่เลือกอยู่ ใช้เป็นตัวตั้งในการคำนวณ */
  summary: Summary | null;
};

/** สีประจำกลุ่มโรค เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา
 *
 * ตั้งใจไม่ใช้สีชุดเดียวกับระดับคุณภาพอากาศ
 * เพราะสีชุดนั้นแปลว่าอันตรายมากน้อย ถ้าเอามาใช้กับชื่อโรค
 * คนจะอ่านว่าโรคสีแดงร้ายแรงกว่าโรคสีเขียว ซึ่งไม่ใช่สิ่งที่แผงนี้บอก
 */
const GROUP_COLORS = ["#5ec8ff", "#ff7b8a", "#ffb457", "#5fd0a4"];

/** ค่าสูงสุดของแกนนอน หน่วยไมโครกรัมต่อลูกบาศก์เมตร
 *
 * หยุดที่ 100 เพราะระดับสูงสุดเริ่มที่ 75 และไม่มีขอบบน
 * ถ้าลากแกนตามค่าที่เคยวัดได้จริงซึ่งบางปีทะลุ 200
 * ช่วงที่คนอยู่จริงเกือบตลอดปีจะถูกบีบจนอ่านไม่ออก
 */
const AXIS_MAX = 100;

/** เกณฑ์ที่ใช้เทียบ ตรงกับค่าใน backend/app/health_advice.py
 *
 * ถ้าที่นั่นแก้ ต้องแก้ตรงนี้ด้วย ไม่งั้นข้อความจะขัดกับหน้าคำแนะนำ
 */
const WHO_GUIDELINE = 15;
const THAI_STANDARD = 37.5;

/** ขอบของแต่ละระดับคุณภาพอากาศ ใช้ขีดเส้นอ้างอิงบนกราฟ */
const LEVEL_MARKS = [
  { at: 15, color: "#00b050" },
  { at: 25, color: "#ffd400" },
  { at: 37.5, color: "#ff7e00" },
  { at: 75, color: "#e2574c" },
];

/**
 * จำนวนผู้เข้ารักษามากกว่าวันอากาศสะอาดกี่เปอร์เซ็นต์ เมื่อฝุ่นเท่านี้
 *
 * เป็นสูตรมาตรฐานของการประเมินผลกระทบสุขภาพ
 * คือเอาความเสี่ยงสัมพัทธ์ยกกำลังตามจำนวนช่วงสิบหน่วยที่ค่าฝุ่นสูงขึ้น
 */
function excessPct(pm25: number, rrPer10: number): number {
  return (Math.pow(rrPer10, pm25 / 10) - 1) * 100;
}

/**
 * เอาค่าฝุ่นที่วัดได้มาคำนวณว่าแต่ละกลุ่มโรคมีคนเข้ารักษาเพิ่มขึ้นกี่เปอร์เซ็นต์
 *
 * ตัวเลขนี้แปลว่าอะไร
 *     จำนวนครั้งที่คนในพื้นที่เข้ารักษา มากกว่าวันที่อากาศสะอาดกี่เปอร์เซ็นต์
 *     ไม่ใช่โอกาสที่คนคนหนึ่งจะป่วย สองอย่างนี้คนละเรื่องกัน
 *     ข้อมูลที่มีเก็บเฉพาะคนที่มาหาหมอ ไม่ได้นับคนที่อยู่บ้านแล้วไม่ป่วย
 *     จึงไม่มีตัวหารสำหรับคำนวณโอกาสของคนคนหนึ่ง
 *
 * ค่าที่ใช้คูณมาจากไหน
 *     จากงานวิจัยที่ตีพิมพ์แล้ว ไม่ได้คำนวณจากข้อมูลของระบบนี้
 *     เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกันเลยสักวัน
 *     แต่ละกลุ่มโรคมาจากคนละงาน น้ำหนักหลักฐานจึงไม่เท่ากัน
 *     แผงนี้เขียนที่มากำกับไว้ทุกแถว ไม่ยุบรวมเป็นตัวเลขชุดเดียวกัน
 */
export function DiseaseRisk({ summary }: Props) {
  const [data, setData] = useState<DiseaseSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.disease();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const riskTable = data?.risk_by_group;
  const current = summary?.pm25_avg ?? null;
  if (!riskTable || current == null) return null;

  // เรียงตามผลของค่าฝุ่นจากมากไปน้อย ไม่ใช่ตามลำดับที่เซิร์ฟเวอร์ส่งมา
  //
  // สาระของแผงคือค่าฝุ่นเท่านี้กระทบโรคไหนมากที่สุด
  // การเรียงตามผลลัพธ์จึงตอบคำถามได้ทันที ไม่ต้องไล่อ่านเทียบทีละแถว
  const rows = Object.entries(riskTable)
    .map(([group, risk], index) => ({
      group,
      risk,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      pct: excessPct(current, risk.relative_risk_per_10),
      peak: excessPct(AXIS_MAX, risk.relative_risk_per_10),
    }))
    .sort((a, b) => b.pct - a.pct);

  // ความสูงของกราฟอิงเส้นที่ชันที่สุด ทุกเส้นจึงอยู่ในสเกลเดียวกัน
  // ถ้าปรับสเกลแยกเส้น เส้นที่ผลน้อยจะดูสูงเท่าเส้นที่ผลมาก ซึ่งหลอกตา
  const ceiling = Math.max(...rows.map((row) => row.peak));

  /** แปลงค่าฝุ่นเป็นความสูงบนกราฟ เว้นหัวไว้ไม่ให้ชนขอบบน */
  const heightOf = (pm25: number, rr: number) =>
    (excessPct(Math.min(pm25, AXIS_MAX), rr) / ceiling) * 88;

  /** วาดเป็นเส้นตรงต่อกันทีละห้าหน่วย ถี่พอจนตาเห็นเป็นเส้นโค้ง */
  const pointsFor = (rr: number) => {
    const points: string[] = [];
    for (let pm25 = 0; pm25 <= AXIS_MAX; pm25 += 5) {
      points.push(`${(pm25 / AXIS_MAX) * 100},${100 - heightOf(pm25, rr)}`);
    }
    return points.join(" ");
  };

  const currentLeft = Math.min(100, (current / AXIS_MAX) * 100);

  // เทียบกับเกณฑ์ที่เข้มกว่าก่อน ผู้อ่านจะได้รู้ตัวตั้งแต่ยังไม่เกินมาตรฐานไทย
  const standing =
    current > THAI_STANDARD
      ? "เกินมาตรฐานของไทย"
      : current > WHO_GUIDELINE
        ? "เกินคำแนะนำขององค์การอนามัยโลก"
        : "อยู่ในคำแนะนำขององค์การอนามัยโลก";

  return (
    <section className="panel drisk">
      <h2 className="panel-title">
        โรคที่มากับฝุ่น
        <span className="panel-hint">เอาค่าฝุ่นที่วัดได้ตอนนี้มาคำนวณ</span>
      </h2>

      {/* บรรทัดนี้ทำให้ตัวตั้งกับผลลัพธ์อยู่ในกล่องเดียวกัน
          ผู้อ่านไม่ต้องเงยกลับขึ้นไปดูการ์ดข้างบนว่าตอนนี้ฝุ่นเท่าไหร่ */}
      <div className="drisk-source-value">
        <span className="drisk-scope">
          ฝุ่นที่วัดได้{summary?.province ? `ใน${summary.province}` : "ทั้งประเทศ"}
        </span>
        <span className="drisk-pm">{current}</span>
        {summary?.level && (
          <>
            <span className="drisk-level-dot" style={{ background: summary.level.color }} />
            <span className="drisk-level">ระดับ{summary.level.label_th}</span>
          </>
        )}
        <span className="drisk-standing">
          {summary?.stations_reporting ? `${summary.stations_reporting} สถานี · ` : ""}
          {standing}
        </span>
      </div>

      <p className="drisk-section">คนเข้ารักษาเพิ่มขึ้นกี่เปอร์เซ็นต์ เทียบกับวันอากาศสะอาด</p>

      <ul className="drisk-rows">
        {rows.map((row) => (
          <li key={row.group}>
            <span className="drisk-swatch" style={{ background: row.color }} />
            <span className="drisk-row-name">
              {row.group.replace("กลุ่มโรค", "")}
              {/* บอกตั้งแต่ในแถวว่าผลของกลุ่มนี้ยังไม่ชัดเจนทางสถิติ
                  ถ้าเขียนรวมไว้ท้ายแผงจะไม่มีใครโยงกลับมาถูกแถว */}
              {row.risk.uncertain && <span className="drisk-uncertain">ผลยังไม่ชัดเจน</span>}
            </span>
            <span className="drisk-row-track">
              <span
                className="drisk-row-bar"
                style={{
                  width: `${Math.min(100, (row.pct / ceiling) * 100)}%`,
                  background: row.color,
                }}
              />
            </span>
            <span className="drisk-row-pct">+{row.pct.toFixed(2)}%</span>
          </li>
        ))}
      </ul>

      <div className="drisk-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {/* เส้นอ้างอิงตรงขอบของแต่ละระดับคุณภาพอากาศ
              ช่วยให้อ่านคู่กับแถบสีที่เห็นในหน้าอื่นได้ว่าตอนนี้อยู่ช่วงไหน */}
          {LEVEL_MARKS.map((mark) => (
            <line
              key={mark.at}
              x1={(mark.at / AXIS_MAX) * 100}
              x2={(mark.at / AXIS_MAX) * 100}
              y1="0"
              y2="100"
              stroke={mark.color}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              opacity="0.28"
            />
          ))}

          {/* เส้นของกลุ่มที่ผลยังไม่ชัดเจนวาดเป็นเส้นประ
              ให้ต่างจากเส้นที่มีหลักฐานหนักแน่นตั้งแต่มองครั้งแรก */}
          {rows.map((row) => (
            <polyline
              key={row.group}
              points={pointsFor(row.risk.relative_risk_per_10)}
              fill="none"
              stroke={row.color}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={row.risk.uncertain ? "4 3" : undefined}
            />
          ))}
        </svg>

        {/* จุดวางเป็น HTML ทับบนกราฟ ไม่ได้วาดไว้ใน svg
            เพราะ svg ตัวนี้ปิดการรักษาสัดส่วนเพื่อให้ยืดเต็มความกว้างจอ
            อะไรที่วาดข้างในจึงถูกยืดตามไปด้วย วงกลมจะกลายเป็นวงรี */}
        {rows.map((row) => (
          <span
            key={row.group}
            className="drisk-now"
            style={{
              left: `${currentLeft}%`,
              bottom: `${heightOf(current, row.risk.relative_risk_per_10)}%`,
              background: row.color,
            }}
          />
        ))}
      </div>

      <div className="drisk-axis" aria-hidden="true">
        {LEVEL_MARKS.map((mark) => (
          <span key={mark.at} style={{ left: `${(mark.at / AXIS_MAX) * 100}%`, color: mark.color }}>
            {mark.at}
          </span>
        ))}
        <span className="drisk-axis-end">{AXIS_MAX}+ µg/m³</span>
      </div>

      <div className="drisk-source">
        <p className="drisk-source-lead">
          ค่าที่ใช้คูณมาจากงานวิจัยที่ตีพิมพ์แล้ว ไม่ได้คำนวณจากข้อมูลของระบบนี้
          เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกัน
          ตัวเลขที่ได้{data?.risk_note_th}
        </p>

        {/* แยกที่มาเป็นรายแถว ไม่ยุบเป็นประโยคเดียว
            เพราะสองกลุ่มมาจากการรวบรวมงานวิจัยหลายประเทศ
            อีกสองกลุ่มมาจากงานวิจัยเมืองเดียว น้ำหนักหลักฐานไม่เท่ากัน */}
        <ul className="drisk-source-list">
          {rows.map((row) => (
            <li key={row.group}>
              <span className="drisk-source-name">{row.group.replace("กลุ่มโรค", "")}</span>
              <span className="drisk-source-rr">{row.risk.relative_risk_per_10}</span>
              <span className="drisk-source-from">
                {row.risk.source_th} · {row.risk.evidence_th}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
