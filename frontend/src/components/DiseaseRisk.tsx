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
const GROUP_COLORS = ["#5ec8ff", "#5fd0a4", "#ffb457", "#ff7b8a"];

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
 * เอาค่าฝุ่นที่วัดได้มาคำนวณว่าคนเข้ารักษาเพิ่มขึ้นเท่าไหร่
 *
 * ทำไมมีโรคเดียว
 *     ชุดข้อมูลของกรมควบคุมโรคเฝ้าระวังสี่กลุ่มโรค แต่มีเพียงกลุ่มทางเดินหายใจ
 *     ที่มีค่าความเสี่ยงสัมพัทธ์ตีพิมพ์แล้วรองรับ อีกสามกลุ่มยังไม่มี
 *     จึงคำนวณได้กลุ่มเดียว การใส่อีกสามกลุ่มโดยไม่มีค่ารองรับคือการเดาตัวเลข
 *
 * ตัวเลขนี้แปลว่าอะไร
 *     จำนวนครั้งที่คนในพื้นที่เข้ารักษา มากกว่าวันที่อากาศสะอาดกี่เปอร์เซ็นต์
 *     ไม่ใช่โอกาสที่คนคนหนึ่งจะป่วย สองอย่างนี้คนละเรื่องกัน
 *     ค่าที่ใช้คูณมาจากงานวิจัยภายนอก ไม่ได้คำนวณจากข้อมูลของระบบนี้
 *     เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกันเลยสักวัน
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

  const groups = data?.by_group ?? [];
  const risk = data?.risk;
  const current = summary?.pm25_avg ?? null;
  if (!risk || current == null) return null;

  const totalCases = groups.reduce((sum, row) => sum + row.cases, 0);

  // ---------- โอกาสเป็นแต่ละโรค ----------
  //
  // เป็นโอกาสแบบมีเงื่อนไข คือรู้อยู่แล้วว่าคนนั้นป่วยจากฝุ่น แล้วถามว่าเป็นโรคไหน
  // ไม่ใช่โอกาสที่คนทั่วไปจะป่วย ซึ่งข้อมูลชุดนี้ตอบไม่ได้เพราะไม่มีตัวหาร
  // คือไม่รู้ว่าในพื้นที่มีคนทั้งหมดกี่คน รู้แค่คนที่มาหาหมอ
  //
  // ความยาวส่วนโค้งคำนวณจากรัศมีจริง ถ้าข้อมูลเปลี่ยนวงแหวนจะปรับตามเอง
  const RADIUS = 62;
  const circumference = 2 * Math.PI * RADIUS;

  let walked = 0;
  const arcs = groups.map((row, index) => {
    const share = totalCases > 0 ? row.cases / totalCases : 0;
    const length = circumference * share;
    const offset = walked;
    walked += length;
    // เว้นช่องว่างสองหน่วยระหว่างส่วน ให้เห็นรอยต่อโดยไม่ต้องตีเส้นขอบ
    const drawn = Math.max(length - 2, 0);
    return {
      ...row,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      share,
      dash: `${drawn} ${circumference - drawn}`,
      offset: -offset,
    };
  });

  const peak = excessPct(AXIS_MAX, risk.relative_risk_per_10);

  /** แปลงค่าฝุ่นเป็นความสูงบนกราฟ เว้นหัวไว้ไม่ให้ชนขอบบน */
  const heightOf = (pm25: number) =>
    (excessPct(Math.min(pm25, AXIS_MAX), risk.relative_risk_per_10) / peak) * 88;

  // วาดเป็นเส้นตรงต่อกันทีละห้าหน่วย ถี่พอจนตาเห็นเป็นเส้นโค้ง
  const points: string[] = [];
  for (let pm25 = 0; pm25 <= AXIS_MAX; pm25 += 5) {
    points.push(`${(pm25 / AXIS_MAX) * 100},${100 - heightOf(pm25)}`);
  }

  const currentPct = excessPct(current, risk.relative_risk_per_10);
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

      {arcs.length > 0 && (
        <>
          <p className="drisk-section">ถ้าป่วยจากฝุ่น โอกาสเป็นโรคไหน</p>

          <div className="drisk-top">
            <div className="drisk-donut">
              <svg viewBox="0 0 160 160" role="img" aria-label="วงแหวนโอกาสเป็นแต่ละกลุ่มโรค">
                {/* หมุนทวนเข็มหนึ่งในสี่รอบ ให้ส่วนแรกเริ่มที่ยอดวงกลม
                    ถ้าไม่หมุนจะเริ่มที่ขอบขวา ซึ่งอ่านลำดับยากกว่า */}
                <g transform="rotate(-90 80 80)">
                  {arcs.map((arc) => (
                    <circle
                      key={arc.group}
                      cx="80"
                      cy="80"
                      r={RADIUS}
                      fill="none"
                      stroke={arc.color}
                      strokeWidth="20"
                      strokeDasharray={arc.dash}
                      strokeDashoffset={arc.offset}
                    />
                  ))}
                </g>
                <text className="drisk-donut-value" x="80" y="76" textAnchor="middle">
                  100%
                </text>
                <text className="drisk-donut-unit" x="80" y="95" textAnchor="middle">
                  ผู้ป่วยจากฝุ่น
                </text>
              </svg>
            </div>

            <ul className="drisk-legend">
              {arcs.map((arc) => (
                <li key={arc.group}>
                  <span className="drisk-swatch" style={{ background: arc.color }} />
                  <span className="drisk-legend-name">{arc.group}</span>
                  <span className="drisk-legend-track">
                    <span
                      className="drisk-legend-bar"
                      style={{ width: `${arc.share * 100}%`, background: arc.color }}
                    />
                  </span>
                  <span className="drisk-legend-share">{(arc.share * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="drisk-section drisk-section-gap">เอาค่าที่วัดได้มาคำนวณ</p>
        </>
      )}

      {/* บรรทัดนี้ทำให้ตัวตั้งกับผลลัพธ์อยู่ในกล่องเดียวกัน
          ผู้อ่านไม่ต้องเงยกลับขึ้นไปดูการ์ดข้างบนว่าตอนนี้ฝุ่นเท่าไหร่ */}
      <div className="drisk-source-value">
        <span className="drisk-scope">ฝุ่นที่วัดได้{summary?.province ? `ใน${summary.province}` : "ทั้งประเทศ"}</span>
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

      <div className="drisk-headline">
        <span className="drisk-headline-name">{risk.group_th} เพิ่มขึ้น</span>
        <span className="drisk-headline-value">+{currentPct.toFixed(2)}%</span>
      </div>

      <div className="drisk-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="driskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5ec8ff" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#5ec8ff" stopOpacity="0.02" />
            </linearGradient>
          </defs>

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
              opacity="0.3"
            />
          ))}

          <polygon points={`0,100 ${points.join(" ")} 100,100`} fill="url(#driskFill)" />
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="#5ec8ff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* จุดวางเป็น HTML ทับบนกราฟ ไม่ได้วาดไว้ใน svg
            เพราะ svg ตัวนี้ปิดการรักษาสัดส่วนเพื่อให้ยืดเต็มความกว้างจอ
            อะไรที่วาดข้างในจึงถูกยืดตามไปด้วย วงกลมจะกลายเป็นวงรี */}
        <span
          className="drisk-now"
          style={{ left: `${currentLeft}%`, bottom: `${heightOf(current)}%` }}
        />
      </div>

      <div className="drisk-axis" aria-hidden="true">
        {LEVEL_MARKS.map((mark) => (
          <span key={mark.at} style={{ left: `${(mark.at / AXIS_MAX) * 100}%`, color: mark.color }}>
            {mark.at}
          </span>
        ))}
        <span className="drisk-axis-end">{AXIS_MAX}+ µg/m³</span>
      </div>

      <p className="drisk-source">
        ค่าที่ใช้คูณมาจาก{risk.source} ไม่ได้คำนวณจากข้อมูลของระบบนี้
        เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกัน
        ตัวเลขที่ได้{risk.note_th}
        <br />
        เปอร์เซ็นต์ของแต่ละโรคคำนวณจากผู้ป่วยจริง {totalCases.toLocaleString("th-TH")} ครั้ง
        ที่{data?.source}บันทึกไว้ เป็นโอกาสเมื่อรู้แล้วว่าป่วยจากฝุ่น
        ไม่ใช่โอกาสที่คนทั่วไปจะป่วย และเป็นสัดส่วนของทั้งชุดข้อมูล ไม่ขยับตามพื้นที่ที่เลือก
      </p>
    </section>
  );
}
