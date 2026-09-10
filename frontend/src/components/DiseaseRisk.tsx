import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { DiseaseSummary, Pm25HourlyPoint, Summary } from "../api";

type Props = {
  /** สรุปค่าฝุ่นของพื้นที่ที่เลือกอยู่ ใช้เป็นตัวตั้งในการคำนวณ */
  summary: Summary | null;
  /** แสดงเป็นวงกลมแทนกล่องกับกราฟเส้น ใช้ในหน้าโรคจากฝุ่น
   *
   * หน้าหลักกับหน้าโรคต้องการคนละแบบ
   *     หน้าหลักเป็นทางผ่าน คนกวาดตาแล้วไปต่อ กล่องกับกราฟเส้นตอบได้ว่า
   *     ค่าเท่าไรและวันนี้ช่วงไหนแย่ที่สุด
   *     หน้าโรคเป็นที่อ่านจริง วงกลมตอบได้ว่าฝุ่นดันโรคไหนแรงกว่ากัน
   *     ซึ่งเป็นคำถามที่คนเปิดหน้านี้มาถาม
   */
  ring?: boolean;
  /** แสดงเฉพาะโรคนี้โรคเดียว ค่าว่างแปลว่าแสดงทุกโรค
   *
   * ใช้ชื่อเต็มตามกุญแจในตารางค่าเสี่ยง ไม่ใช่ชื่อย่อที่ตัดคำนำหน้าออกแล้ว
   */
  only?: string;
};

/** สีประจำกลุ่มโรค เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา
 *
 * ตั้งใจไม่ใช้สีชุดเดียวกับระดับคุณภาพอากาศ
 * เพราะสีชุดนั้นแปลว่าอันตรายมากน้อย ถ้าเอามาใช้กับชื่อโรค
 * คนจะอ่านว่าโรคสีแดงร้ายแรงกว่าโรคสีเขียว ซึ่งไม่ใช่สิ่งที่แผงนี้บอก
 */
const GROUP_COLORS = [
  "#0b6bcb",
  "#c62b45",
  "#9c5c07",
  "#0d7e5a",
  "#5f4488",
  "#a13d7a",
  "#15607a",
];

/** รัศมีและเส้นรอบวงของวงกลม ใช้แปลงสัดส่วนเป็นความยาวเส้นประ */
const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** ระยะห่างระหว่างชิ้น หน่วยเดียวกับเส้นรอบวง
 *
 * ต้องมีช่องว่าง ไม่ให้ชิ้นชนกันสนิท เพราะสองชิ้นที่ติดกันโดยไม่มีเส้นคั่น
 * อ่านเป็นชิ้นเดียวเมื่อสีใกล้กัน ต่างจากกล่องที่อยู่ห่างกันอยู่แล้ว
 */
const SLICE_GAP = 2;

/** เกณฑ์ที่ใช้เทียบ ตรงกับค่าใน backend/app/health_advice.py
 *
 * ถ้าที่นั่นแก้ ต้องแก้ตรงนี้ด้วย ไม่งั้นข้อความจะขัดกับหน้าคำแนะนำ
 */
const WHO_GUIDELINE = 15;
const THAI_STANDARD = 37.5;

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
 *
 * ทำไมกราฟใช้แกนเวลา
 *     ให้เป็นชนิดเดียวกับกราฟย้อนหลังที่เว็บมีอยู่แล้ว คนใช้จึงอ่านเป็นทันที
 *     และตอบได้ว่าวันนี้ช่วงไหนแย่ที่สุด ซึ่งกราฟที่ลากตามค่าฝุ่นตอบไม่ได้
 */
export function DiseaseRisk({ summary, ring = false, only = "" }: Props) {
  const [data, setData] = useState<DiseaseSummary | null>(null);
  const [hourly, setHourly] = useState<Pm25HourlyPoint[]>([]);
  const province = summary?.province ?? null;

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

  // ดึงใหม่ทุกครั้งที่เปลี่ยนพื้นที่ กราฟจึงเป็นของจังหวัดที่เลือกเสมอ
  //
  // ข้ามไปเลยเมื่อแสดงเป็นวงกลม เพราะวงกลมใช้ค่าเฉลี่ยค่าเดียว ไม่ได้ใช้รายชั่วโมง
  // ถ้าไม่ข้าม หน้าโรคจะยิงคำขอที่ไม่มีใครใช้ผลลัพธ์ทุกครั้งที่เปลี่ยนจังหวัด
  useEffect(() => {
    if (ring) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.pm25Hourly(province, 24);
        if (!cancelled) setHourly(result);
      } catch {
        if (!cancelled) setHourly([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province, ring]);

  const riskTable = data?.risk_by_group;
  const current = summary?.pm25_avg ?? null;
  if (!riskTable || current == null) return null;

  // เรียงตามผลของค่าฝุ่นจากมากไปน้อย ไม่ใช่ตามลำดับที่เซิร์ฟเวอร์ส่งมา
  //
  // สาระของแผงคือค่าฝุ่นเท่านี้กระทบโรคไหนมากที่สุด
  // การเรียงตามผลลัพธ์จึงตอบคำถามได้ทันที ไม่ต้องไล่อ่านเทียบทีละแถว
  // กรองก่อนแจกสี ไม่ใช่หลังแจกสี
  //
  // ถ้ากรองทีหลัง โรคที่เหลือจะได้สีตามลำดับใหม่ ทำให้สีเปลี่ยนไปมาเมื่อสลับตัวเลือก
  // สีต้องผูกกับโรค ไม่ใช่ผูกกับอันดับที่มันอยู่ในรายการ
  const allRows = Object.entries(riskTable)
    .map(([group, risk], index) => ({
      group,
      // ตัดคำนำหน้าออกให้เหลือแต่ชื่อโรค กล่องจะได้แคบลงและชื่อเรียงกันสม่ำเสมอ
      // ต้องตัดทั้ง "กลุ่มโรค" และ "โรค" เพราะรายการในตารางใช้คำนำหน้าไม่เหมือนกัน
      // บางตัวเป็นกลุ่มโรคตามที่กรมควบคุมโรคเรียก บางตัวเป็นโรคเดี่ยวจากงานวิจัย
      short: group.replace(/^(กลุ่มโรค|โรค)/, ""),
      risk,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      pct: excessPct(current, risk.relative_risk_per_10),
    }))
    .sort((a, b) => b.pct - a.pct);

  const rows = allRows.filter((row) => !only || row.group === only);

  // ผลรวมคิดจากทุกโรคเสมอ ไม่ใช่จากโรคที่เหลือหลังกรอง
  //
  // เพราะสัดส่วนที่แสดงต้องแปลว่า "ส่วนแบ่งของโรคนี้ในผลทั้งหมดที่ฝุ่นก่อ"
  // ถ้าหารด้วยผลรวมของโรคที่เลือกไว้ โรคเดียวจะได้ 100% เสมอ ซึ่งไม่จริง
  // และพอสลับโรค ตัวเลขสัดส่วนจะเป็น 100% เท่ากันหมดจนเทียบอะไรไม่ได้เลย
  //
  // ตัวผลรวมเองไม่เอาไปแสดงที่ไหน เพราะแต่ละเปอร์เซ็นต์วัดจากฐานคนละฐาน
  // บวกกันแล้วไม่มีความหมาย ใช้เป็นตัวหารอย่างเดียว
  const totalPct = allRows.reduce((sum, row) => sum + row.pct, 0) || 1;
  let cursor = 0;
  const slices = rows.map((row) => {
    const share = row.pct / totalPct;
    const length = share * CIRCUMFERENCE;
    const slice = {
      ...row,
      share,
      dash: `${Math.max(0, length - SLICE_GAP)} ${CIRCUMFERENCE - length + SLICE_GAP}`,
      offset: -cursor,
    };
    cursor += length;
    return slice;
  });

  // แปลงค่าฝุ่นรายชั่วโมงเป็นเปอร์เซ็นต์ของทุกกลุ่มโรคในจุดเดียวกัน
  // ใช้ชื่อย่อเป็นกุญแจ เพราะเป็นชื่อเดียวกับที่แสดงในคำอธิบายสีของกราฟ
  const series = hourly.map((point) => {
    const row: Record<string, number | string> = { label: point.label, pm25: point.pm25 };
    for (const item of rows) {
      row[item.short] = Number(excessPct(point.pm25, item.risk.relative_risk_per_10).toFixed(2));
    }
    return row;
  });

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
        <span className="panel-hint">เอาค่าฝุ่นที่วัดได้มาคำนวณ</span>
      </h2>

      {/* บรรทัดนี้ทำให้ตัวตั้งกับผลลัพธ์อยู่ในกล่องเดียวกัน
          ผู้อ่านไม่ต้องเงยกลับขึ้นไปดูการ์ดข้างบนว่าตอนนี้ฝุ่นเท่าไหร่ */}
      <div className="drisk-source-value">
        <span className="drisk-scope">
          ฝุ่นที่วัดได้{province ? `ใน${province}` : "ทั้งประเทศ"}
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

      {ring && rows.length === 1 ? (
        /* เลือกโรคเดียวก็ยังเป็นวงกลม แต่เป็นวงชิ้นเดียวบนรางสีเทา
           ไม่ใช่วงเต็มใบ เพราะความยาวของชิ้นคือส่วนแบ่งของโรคนี้ในผลทั้งหมด
           ซึ่งหารด้วยผลรวมของทั้งเจ็ดโรคเสมอ ไม่ใช่ของโรคที่เลือกไว้
           รางสีเทาที่เหลือจึงเป็นส่วนของอีกหกโรคที่ไม่ได้เลือก มีความหมายจริง

           ข้างวงใส่ที่มาของตัวเลขได้ครบ เพราะมีโรคเดียวจึงไม่ยาวจนรก
           ต่างจากตอนแสดงเจ็ดโรคที่ต้องยุบที่มาไปไว้ที่อื่น */
        <div className="drisk-ring-row">
          <svg
            className="drisk-ring"
            viewBox="0 0 180 180"
            role="img"
            aria-label={`ส่วนแบ่งผลของฝุ่นต่อ${rows[0].short}`}
          >
            <g transform="rotate(-90 90 90)" fill="none" strokeWidth="26">
              <circle cx="90" cy="90" r={RADIUS} stroke="var(--surface-2)" />
              <circle
                cx="90"
                cy="90"
                r={RADIUS}
                stroke={rows[0].color}
                strokeLinecap="round"
                strokeDasharray={`${(rows[0].pct / totalPct) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              />
            </g>
            <text className="drisk-ring-value" x="90" y="82" textAnchor="middle">
              +{rows[0].pct.toFixed(2)}%
            </text>
            <text className="drisk-ring-unit" x="90" y="102" textAnchor="middle">
              {rows[0].short}
            </text>
            <text className="drisk-ring-unit" x="90" y="119" textAnchor="middle">
              {((rows[0].pct / totalPct) * 100).toFixed(1)}% ของผลรวม
            </text>
          </svg>

          <div className="drisk-solo">
            <p className="drisk-solo-name" style={{ color: rows[0].color }}>
              <span className="drisk-legend-dot" style={{ background: rows[0].color }} />
              {rows[0].short}
              {rows[0].risk.uncertain && <em>*</em>}
            </p>
            <p className="drisk-solo-outcome">{rows[0].risk.outcome_th}</p>

            <dl className="drisk-solo-facts">
              <div>
                <dt>ความเสี่ยงสัมพัทธ์ต่อฝุ่น 10 หน่วย</dt>
                <dd>{rows[0].risk.relative_risk_per_10}</dd>
              </div>
              <div>
                <dt>ช่วงความเชื่อมั่น</dt>
                <dd>
                  {rows[0].risk.ci_low}–{rows[0].risk.ci_high}
                </dd>
              </div>
              <div>
                <dt>ฝุ่นที่ใช้คำนวณ</dt>
                <dd>{current} µg/m³</dd>
              </div>
            </dl>

            <p className="drisk-solo-source">
              {rows[0].risk.source_th} · {rows[0].risk.evidence_th}
              {rows[0].risk.uncertain &&
                " · ช่วงความเชื่อมั่นคร่อมเลขหนึ่ง ผลยังไม่ชัดเจนทางสถิติ"}
            </p>
          </div>
        </div>
      ) : ring ? (
        <>
          <p className="drisk-section">
            ฝุ่นวันนี้ดันโรคไหนแรงที่สุด
            <span>ชิ้นใหญ่แปลว่าฝุ่นดันโรคนั้นแรงกว่า ไม่ใช่ว่ามีคนป่วยเยอะกว่า</span>
          </p>

          <div className="drisk-ring-row">
            <svg
              className="drisk-ring"
              viewBox="0 0 180 180"
              role="img"
              aria-label="สัดส่วนผลของฝุ่นต่อแต่ละโรค"
            >
              <g transform="rotate(-90 90 90)" fill="none" strokeWidth="26">
                {slices.map((slice) => (
                  <circle
                    key={slice.group}
                    cx="90"
                    cy="90"
                    r={RADIUS}
                    stroke={slice.color}
                    strokeDasharray={slice.dash}
                    strokeDashoffset={slice.offset}
                  />
                ))}
              </g>
              {/* ตรงกลางเป็นค่าฝุ่น ไม่ใช่ผลรวมของทุกชิ้น
                  เพราะเปอร์เซ็นต์ของแต่ละโรควัดจากฐานคนละฐาน บวกกันแล้วไม่มีความหมาย
                  ถ้าใส่ผลรวมไว้ตรงกลางจะเป็นตัวเลขที่ผิด */}
              <text className="drisk-ring-value" x="90" y="84" textAnchor="middle">
                {current}
              </text>
              <text className="drisk-ring-unit" x="90" y="104" textAnchor="middle">
                µg/m³ ที่วัดได้
              </text>
            </svg>

            {/* ตารางข้างวงเก็บค่าจริงของทุกโรคไว้ครบ
                วงกลมบอกได้แค่ว่าชิ้นไหนใหญ่กว่า แต่บอกไม่ได้ว่าเท่าไร
                ถ้ามีแต่วงอย่างเดียว ตัวเลขที่เป็นสาระจะหายไป */}
            <ul className="drisk-legend">
              <li className="drisk-legend-head">
                <span />
                <span>โรค</span>
                <span>เพิ่มขึ้น</span>
                <span>สัดส่วน</span>
              </li>
              {slices.map((slice) => (
                <li key={slice.group}>
                  <span className="drisk-legend-dot" style={{ background: slice.color }} />
                  <span className="drisk-legend-name">
                    {slice.short}
                    {slice.risk.uncertain && <em>*</em>}
                  </span>
                  <span className="drisk-legend-pct">+{slice.pct.toFixed(2)}%</span>
                  <span className="drisk-legend-share">{(slice.share * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="drisk-ring-note">
            เครื่องหมายดอกจันคือกลุ่มที่ช่วงความเชื่อมั่นคร่อมเลขหนึ่ง ผลยังไม่ชัดเจนทางสถิติ ·
            คอลัมน์เพิ่มขึ้นคือค่าจริงของโรคนั้น ส่วนคอลัมน์สัดส่วนคือส่วนแบ่งในวงกลม
          </p>
        </>
      ) : (
        <>
      <p className="drisk-section">คนเข้ารักษาเพิ่มขึ้น เทียบกับวันอากาศสะอาด</p>

      <div className="drisk-tiles">
        {rows.map((row) => (
          <div
            key={row.group}
            className="drisk-tile"
            style={{ borderTopColor: row.color, borderTopStyle: row.risk.uncertain ? "dashed" : "solid" }}
          >
            <p className="drisk-tile-value" style={{ color: row.color }}>
              +{row.pct.toFixed(2)}
              <span className="drisk-tile-unit">%</span>
            </p>
            <p className="drisk-tile-name">{row.short}</p>
          </div>
        ))}
      </div>

      {series.length >= 2 && (
        <div className="chart">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
              {/* พื้นไล่สีใต้เส้น ชุดเดียวกับกราฟย้อนหลังของสถานี
                  ให้ทั้งเว็บใช้ภาษาภาพเดียวกัน ไม่ใช่ต่างหน้าต่างสไตล์ */}
              <defs>
                {rows.map((row, index) => (
                  <linearGradient
                    key={row.group}
                    id={`driskFill${index}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={row.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={row.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf1" />
              <XAxis dataKey="label" tick={{ fontSize: 14.5 }} />
              <YAxis tick={{ fontSize: 14.5 }} unit="%" width={77} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "#ccd6e0",
                  background: "#ffffff",
                  color: "#131a24",
                  fontSize: 15.5,
                }}
                labelFormatter={(label) => `เวลา ${label}`}
                formatter={(value, name) => [`+${value}%`, name]}
              />
              <Legend />
              {rows.map((row, index) => (
                <Area
                  key={row.group}
                  type="monotone"
                  dataKey={row.short}
                  name={row.short}
                  stroke={row.color}
                  strokeWidth={2}
                  // เส้นประบอกว่าผลของกลุ่มนี้ยังไม่ชัดเจนทางสถิติ
                  // ใช้สัญลักษณ์เดียวกับขีดบนกล่องตัวเลขข้างบน
                  strokeDasharray={row.risk.uncertain ? "6 4" : undefined}
                  fill={`url(#driskFill${index})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
        </>
      )}

    </section>
  );
}
