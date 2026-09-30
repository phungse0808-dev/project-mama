import { useEffect, useState } from "react";
import type { DustCases as DustCasesData } from "../api";
import { api } from "../api";

type DustSeries = NonNullable<DustCasesData["dust_series"]>;
type DustSource = DustSeries["sources"][number];

/** สีของระดับคุณภาพอากาศ ใช้ชุดเดียวกับที่แสดงทั้งเว็บ
 *
 * เก็บไว้ที่นี่เพราะฝั่งเซิร์ฟเวอร์ส่งมาเป็นตัวเลขอย่างเดียว ไม่ได้ส่งสีมาด้วย
 */
function levelColor(value: number): string {
  if (value < 15) return "#0099ff";
  if (value < 25) return "#00b050";
  if (value < 37.5) return "#ffd400";
  return "#ff7e00";
}

const MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function thaiYear(label: string): number {
  return Number(label.slice(0, 4)) + 543;
}

/** เขียนป้ายเวลาเป็นภาษาไทย รับได้ทั้งแบบเดือน 2026-09 และแบบวัน 2026-09-25 */
function thaiLabel(label: string): string {
  const month = MONTH_SHORT[Number(label.slice(5, 7)) - 1];
  if (label.length > 7)
    return `${Number(label.slice(8))} ${month} ${thaiYear(label)}`;
  return `${month} ${thaiYear(label)}`;
}

const ALL_YEARS = "ทั้งหมด";

/** แหล่งข้อมูลต้องมีอย่างน้อยกี่จังหวัด จึงจะเอามาจัดอันดับทั้งประเทศได้
 *
 * แหล่งที่มีไม่กี่จังหวัดเอามาเรียงแล้วอ่านผิด เพราะจังหวัดที่ไม่มีข้อมูล
 * จะหายไปจากตารางเฉย ๆ ไม่ได้แปลว่าฝุ่นน้อย
 */
const MIN_PROVINCES = 50;

/** สรุปของจังหวัดหนึ่งในช่วงที่เลือก ใช้จัดอันดับ */
type ProvinceSummary = {
  province: string;
  over: number;
  who: number;
  highest: number;
  peakLabel: string;
  months: number;
};

/** อันดับจังหวัดจากข้อมูลย้อนหลัง
 *
 * ตอบคำถามตั้งต้นของโครงงานที่ว่าค่าฝุ่นของแต่ละจังหวัดเป็นเท่าใด
 * ต่างจากอันดับตามค่าปัจจุบันตรงที่ตอบได้ว่าจังหวัดไหนเจอปัญหาบ่อยกว่ากันตลอดช่วงที่มีข้อมูล
 * ไม่ใช่แค่วันนี้ใครสูงสุด ซึ่งเปลี่ยนไปมาทุกวันตามสภาพอากาศ
 *
 * คำนวณที่ฝั่งนี้ทั้งหมดเพราะเซิร์ฟเวอร์ส่งค่าของทุกจังหวัดมาครบอยู่แล้ว
 * เปลี่ยนแหล่งหรือเปลี่ยนปีจึงคิดใหม่ได้ทันทีโดยไม่ต้องเรียกใหม่
 */
export function ProvinceDustRanking() {
  const [data, setData] = useState<DustCasesData | null>(null);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [year, setYear] = useState(ALL_YEARS);

  useEffect(() => {
    let cancelled = false;
    api
      .dustCases()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const series = data?.dust_series;
  if (!series || series.sources.length === 0) return null;

  // ใช้เฉพาะค่าที่สถานีวัดได้จริง ไม่เอาค่าจากแบบจำลองมาจัดอันดับ
  // และตัดแหล่งที่มีไม่กี่จังหวัดออก ถึงจะเป็นค่าจริงก็เอามาเรียงทั้งประเทศไม่ได้
  const usable = series.sources.filter(
    (item) =>
      !item.key.startsWith("model") &&
      Object.keys(item.provinces).length >= MIN_PROVINCES,
  );
  if (usable.length === 0) return null;
  const source: DustSource =
    usable.find((item) => item.key === (sourceKey ?? series.default_key)) ??
    usable[0];
  const years = [
    ...new Set(source.labels.map((label) => String(thaiYear(label)))),
  ].sort();
  const activeYear =
    year !== ALL_YEARS && !years.includes(year) ? ALL_YEARS : year;

  const rows: ProvinceSummary[] = [];
  for (const [province, values] of Object.entries(source.provinces)) {
    let over = 0;
    let who = 0;
    let months = 0;
    let highest = -1;
    let peak = "";
    values.forEach((value, index) => {
      const label = source.labels[index];
      if (value == null) return;
      if (activeYear !== ALL_YEARS && String(thaiYear(label)) !== activeYear)
        return;
      months += 1;
      if (value > series.thai_standard) over += 1;
      if (value > series.who_guideline) who += 1;
      if (value > highest) {
        highest = value;
        peak = label;
      }
    });
    if (months > 0) {
      rows.push({ province, over, who, highest, peakLabel: peak, months });
    }
  }
  if (rows.length < 3) return null;

  // เรียงตามจำนวนช่วงที่เกินมาตรฐาน เท่ากันให้ดูค่าสูงสุด
  rows.sort((a, b) => b.over - a.over || b.highest - a.highest);

  const exceeded = rows.filter((item) => item.over > 0).length;
  const highestOfAll = Math.max(...rows.map((item) => item.highest));
  const mostOver = rows[0].over;
  const unit = source.granularity === "day" ? "วัน" : "เดือน";

  const top = rows.slice(0, 10);
  const bottom = rows.slice(-3);
  const hidden = rows.length - top.length - bottom.length;

  const line = (item: ProvinceSummary, rank: number) => (
    <tr key={item.province}>
      <td className="drank-no">{rank}</td>
      <td className="drank-name">{item.province}</td>
      <td>
        <span className="drank-bar">
          <span className="drank-track">
            <span
              className="drank-fill"
              style={{
                width: `${mostOver ? (item.over / mostOver) * 100 : 0}%`,
              }}
            />
          </span>
          <span className="dcase-num">{item.over}</span>
        </span>
      </td>
      <td className="dcase-num">{item.who}</td>
      <td className="dcase-num" style={{ color: levelColor(item.highest) }}>
        {item.highest.toFixed(1)}
      </td>
      <td className="drank-when">{thaiLabel(item.peakLabel)}</td>
    </tr>
  );

  return (
    <section className="panel">
      <h2 className="panel-title">
        อันดับจังหวัดที่ค่าเกินมาตรฐานไทย
        <span className="panel-hint">
          {exceeded === 0
            ? `เรียงตามค่าสูงสุดที่พบ ไม่มีจังหวัดใดเกินในช่วงนี้`
            : `เรียงตามจำนวน${unit}ที่เกิน ${series.thai_standard} µg/m³`}
        </span>
      </h2>

      {usable.length > 1 && (
        <div className="dtrend-sources">
          {usable.map((item) => (
            <button
              key={item.key}
              type="button"
              className={item.key === source.key ? "is-on" : ""}
              onClick={() => setSourceKey(item.key)}
            >
              {item.label_th}
              <small>{item.detail_th}</small>
            </button>
          ))}
        </div>
      )}

      {years.length > 1 && (
        <div className="dtrend-years drank-years">
          {[ALL_YEARS, ...years].map((item) => (
            <button
              key={item}
              type="button"
              className={item === activeYear ? "is-on" : ""}
              onClick={() => setYear(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="dtrend-stats">
        <div>
          <p className="dtrend-key">จังหวัดที่เคยเกินมาตรฐาน</p>
          <p className="dtrend-value" style={{ color: "#ff7e00" }}>
            {exceeded}
          </p>
          <p className="dtrend-unit">จาก {rows.length} จังหวัด</p>
        </div>
        <div>
          <p className="dtrend-key">ค่าสูงสุดที่พบ</p>
          <p
            className="dtrend-value"
            style={{ color: levelColor(highestOfAll) }}
          >
            {highestOfAll.toFixed(1)}
          </p>
          <p className="dtrend-unit">µg/m³</p>
        </div>
        <div>
          <p className="dtrend-key">ช่วงที่นับ</p>
          <p className="dtrend-value">{rows[0].months}</p>
          <p className="dtrend-unit">{unit}ต่อจังหวัด</p>
        </div>
      </div>

      <div className="dcase-table-wrap">
        <table className="dcase-table drank-table">
          <thead>
            <tr>
              <th />
              <th>จังหวัด</th>
              <th>เกินมาตรฐาน</th>
              <th>เกิน WHO</th>
              <th>สูงสุด</th>
              <th>เมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {top.map((item, index) => line(item, index + 1))}
            {hidden > 0 && (
              <tr className="drank-gap">
                <td colSpan={6}>⋯ อีก {hidden} จังหวัด ⋯</td>
              </tr>
            )}
            {bottom.map((item, index) =>
              line(item, rows.length - bottom.length + index + 1),
            )}
          </tbody>
        </table>
      </div>

      {/* ข้อจำกัดนี้ต้องอยู่ติดกับตาราง
          ถ้าไม่มี อันดับจะถูกอ่านว่าภาคเหนือฝุ่นน้อยกว่าปริมณฑล ซึ่งสรุปแบบนั้นไม่ได้ */}
      <p className="dcase-warn">
        <strong>อ่านอันดับนี้อย่างระวัง</strong> ค่าที่ใช้เป็นค่าเฉลี่ยราย{unit}
        {unit === "เดือน"
          ? " เดือนที่ค่าเฉลี่ยไม่ถึงมาตรฐานอาจมีหลายวันที่เกิน จำนวนที่นับได้จึงต่ำกว่าความจริง"
          : ""}
        {source.key.startsWith("model")
          ? " · และแบบจำลองประเมินฝุ่นภาคเหนือช่วงฤดูเผาต่ำกว่าความจริง จังหวัดภาคเหนือจึงถูกจัดอันดับต่ำกว่าที่ควรเป็น จะสรุปว่าภาคเหนือฝุ่นน้อยกว่าภาคอื่นจากตารางนี้ไม่ได้"
          : ` · เป็นค่าที่สถานีวัดได้จริง แต่ระบบเพิ่งเริ่มเก็บ จึงมีแค่ ${source.labels.length} วัน ยังไม่ครอบคลุมฤดูเผาของภาคเหนือ และ ${77 - Object.keys(source.provinces).length} จังหวัดที่ไม่มีสถานีจะไม่อยู่ในตารางนี้`}
      </p>
    </section>
  );
}
