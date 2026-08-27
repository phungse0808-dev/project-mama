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
};

/** สีประจำกลุ่มโรค เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา
 *
 * ตั้งใจไม่ใช้สีชุดเดียวกับระดับคุณภาพอากาศ
 * เพราะสีชุดนั้นแปลว่าอันตรายมากน้อย ถ้าเอามาใช้กับชื่อโรค
 * คนจะอ่านว่าโรคสีแดงร้ายแรงกว่าโรคสีเขียว ซึ่งไม่ใช่สิ่งที่แผงนี้บอก
 */
const GROUP_COLORS = ["#5ec8ff", "#ff7b8a", "#f0a326", "#5fd0a4"];

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
export function DiseaseRisk({ summary }: Props) {
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
  useEffect(() => {
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
  }, [province]);

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
      short: group.replace("กลุ่มโรค", ""),
      risk,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      pct: excessPct(current, risk.relative_risk_per_10),
    }))
    .sort((a, b) => b.pct - a.pct);

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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,150,190,.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" width={64} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "#2b3d52",
                  background: "#0d1420",
                  color: "#eaf6ff",
                  fontSize: 13,
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

      <div className="drisk-source">
        <p className="drisk-source-lead">
          ค่าที่ใช้คูณมาจากงานวิจัยที่ตีพิมพ์แล้ว ไม่ได้คำนวณจากข้อมูลของระบบนี้
          เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกัน
          ตัวเลขที่ได้{data?.risk_note_th} เส้นประคือกลุ่มที่ผลยังไม่ชัดเจนทางสถิติ
        </p>

        {/* แยกที่มาเป็นรายแถว ไม่ยุบเป็นประโยคเดียว
            เพราะสองกลุ่มมาจากการรวบรวมงานวิจัยหลายประเทศ
            อีกสองกลุ่มมาจากงานวิจัยเมืองเดียว น้ำหนักหลักฐานไม่เท่ากัน */}
        <ul className="drisk-source-list">
          {rows.map((row) => (
            <li key={row.group}>
              <span className="drisk-source-name">{row.short}</span>
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
