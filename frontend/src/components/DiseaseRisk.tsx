import { useEffect, useState } from "react";
import { api } from "../api";
import type { DiseaseSummary } from "../api";

type Props = {
  /** ค่าฝุ่นของพื้นที่ที่เลือกอยู่ ไม่มีก็ไม่ต้องขีดจุด */
  current: number | null;
};

/** สีประจำกลุ่มโรค เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา
 *
 * ตั้งใจไม่ใช้สีชุดเดียวกับระดับคุณภาพอากาศ
 * เพราะสีชุดนั้นแปลว่าอันตรายมากน้อย ถ้าเอามาใช้กับชื่อโรค
 * คนจะอ่านว่าโรคสีแดงร้ายแรงกว่าโรคสีเขียว ซึ่งไม่ใช่สิ่งที่กราฟนี้บอก
 */
const GROUP_COLORS = ["#5ec8ff", "#5fd0a4", "#ffb457", "#ff7b8a"];

/** ค่าสูงสุดของแกนนอน หน่วยไมโครกรัมต่อลูกบาศก์เมตร */
const AXIS_MAX = 100;

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
 * กราฟโรคที่มากับฝุ่น
 *
 * ตอบสองคำถามที่ต่อกัน
 *     วงแหวนตอบว่ามีโรคอะไรบ้าง และกลุ่มไหนเจอมากที่สุด
 *     เส้นโค้งตอบว่าพอฝุ่นสูงขึ้นแล้วจำนวนผู้เข้ารักษาขยับขึ้นแค่ไหน
 *
 * ที่มาของสองส่วนนี้ต่างกัน จึงต้องแยกให้เห็นชัดในกล่องที่มาข้างล่าง
 *     วงแหวนเป็นข้อมูลจริงที่ระบบนี้เก็บมาจากกรมควบคุมโรค
 *     เส้นโค้งเป็นค่าจากงานวิจัยที่ตีพิมพ์แล้ว ไม่ได้คำนวณจากข้อมูลของเราเอง
 *     เพราะช่วงเวลาของข้อมูลสองชุดไม่ทับกันเลยสักวัน
 */
export function DiseaseRisk({ current }: Props) {
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
  if (!data?.available || groups.length === 0 || !risk) return null;

  const total = groups.reduce((sum, row) => sum + row.cases, 0);
  if (total <= 0) return null;

  // ---------- วงแหวน ----------
  //
  // คำนวณความยาวส่วนโค้งจากรัศมีจริง แทนที่จะใส่ตัวเลขตายตัว
  // ถ้าวันหลังข้อมูลเปลี่ยนหรือมีกลุ่มโรคเพิ่ม วงแหวนจะปรับตามเอง
  const RADIUS = 62;
  const circumference = 2 * Math.PI * RADIUS;

  let walked = 0;
  const arcs = groups.map((row, index) => {
    const share = row.cases / total;
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

  // ---------- เส้นโค้ง ----------
  const peak = excessPct(AXIS_MAX, risk.relative_risk_per_10);

  /** แปลงค่าเปอร์เซ็นต์เป็นความสูงบนกราฟ เว้นหัวไว้ไม่ให้ชนขอบบน */
  const heightOf = (pm25: number) =>
    (excessPct(Math.min(pm25, AXIS_MAX), risk.relative_risk_per_10) / peak) * 88;

  // วาดเป็นเส้นตรงต่อกันทีละห้าหน่วย ถี่พอจนตาเห็นเป็นเส้นโค้ง
  const points: string[] = [];
  for (let pm25 = 0; pm25 <= AXIS_MAX; pm25 += 5) {
    points.push(`${(pm25 / AXIS_MAX) * 100},${100 - heightOf(pm25)}`);
  }

  const currentPct = current == null ? null : excessPct(current, risk.relative_risk_per_10);
  const currentLeft = current == null ? 0 : Math.min(100, (current / AXIS_MAX) * 100);

  return (
    <section className="panel drisk">
      <h2 className="panel-title">
        โรคที่มากับฝุ่น
        <span className="panel-hint">มีโรคอะไรบ้าง · และฝุ่นสูงขึ้นแล้วคนป่วยเพิ่มแค่ไหน</span>
      </h2>

      <div className="drisk-top">
        <div className="drisk-donut">
          <svg viewBox="0 0 160 160" role="img" aria-label="สัดส่วนผู้เข้ารักษาแต่ละกลุ่มโรค">
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
              {total.toLocaleString("th-TH")}
            </text>
            <text className="drisk-donut-unit" x="80" y="95" textAnchor="middle">
              ครั้งที่เข้ารักษา
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
              <span className="drisk-legend-count">{arc.cases.toLocaleString("th-TH")}</span>
              <span className="drisk-legend-share">{(arc.share * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="drisk-curve-head">
        <p className="drisk-curve-title">พอฝุ่นสูงขึ้น {risk.outcome_th}เพิ่มขึ้นเท่าไหร่</p>
        <p className="drisk-curve-sub">เทียบกับวันที่อากาศสะอาด · เฉพาะ{risk.group_th}</p>
      </div>

      {/* ป้ายบอกค่าปัจจุบันมีเลนของตัวเองเหนือกราฟ ไม่ได้ลอยอยู่ข้างจุด
          เพราะเส้นโค้งยกสูงขึ้นเรื่อยไปทางขวา ถ้าป้ายเกาะจุดจะทับเส้นเมื่อค่าฝุ่นสูง
          ส่วน clamp กันไม่ให้ป้ายล้นออกนอกแผงเมื่อจุดอยู่ชิดขอบซ้ายหรือขวา */}
      {current != null && currentPct != null && (
        <div className="drisk-tag-row">
          <span
            className="drisk-now-tag"
            style={{ left: `clamp(76px, ${currentLeft}%, calc(100% - 76px))` }}
          >
            ตอนนี้ {current} · <strong>+{currentPct.toFixed(2)}%</strong>
          </span>
        </div>
      )}

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
        {current != null && (
          <span
            className="drisk-now"
            style={{ left: `${currentLeft}%`, bottom: `${heightOf(current)}%` }}
          />
        )}
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
        <strong>วงแหวน</strong> เป็นจำนวนครั้งที่เข้ารักษาจริง จาก{data.source} {data.provinces?.length} จังหวัด
        ช่วง {data.period?.start} ถึง {data.period?.end} นับเป็นครั้งที่เข้ารักษา ไม่ใช่จำนวนคน
        คนเดิมมาหลายครั้งจะถูกนับหลายครั้ง
        <br />
        <strong>เส้นโค้ง</strong> ใช้ค่าความเสี่ยงจาก{risk.source} ไม่ได้คำนวณจากข้อมูลของระบบนี้
        เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกัน ตัวเลขที่ได้{risk.note_th}{" "}
        และมีเฉพาะ{risk.group_th} เพราะเป็นกลุ่มเดียวที่มีค่าอ้างอิงตีพิมพ์แล้วรองรับ
      </p>
    </section>
  );
}
