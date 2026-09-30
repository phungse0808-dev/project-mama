import { useEffect, useState } from "react";
import type { DustCases as DustCasesData } from "../api";
import { api } from "../api";

/** สีของระดับฝุ่นแต่ละช่วง ใช้ชุดเดียวกับระดับคุณภาพอากาศที่แสดงทั้งเว็บ
 *
 * เก็บไว้ที่นี่เพราะฝั่งเซิร์ฟเวอร์ส่งมาเป็นป้ายชื่อช่วงอย่างเดียว ไม่ได้ส่งสีมาด้วย
 */
const BUCKET_COLORS: Record<string, string> = {
  ดีมาก: "#0099ff",
  ดี: "#00b050",
  ปานกลาง: "#ffd400",
  เกินมาตรฐาน: "#ff7e00",
};

/** เขียนเปอร์เซ็นต์ให้มีเครื่องหมายเสมอ ใช้ขีดลบยาวแทนขีดสั้นเพื่อให้อ่านออกในภาษาไทย */
function signedPct(value: number): string {
  return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1).replace("-", "−")}%`;
}

/** ปี พ.ศ. จากคีย์เดือนแบบ 2024-01 */
function thaiYear(ym: string): number {
  return Number(ym.slice(0, 4)) + 543;
}

const MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** เขียนป้ายเวลาเป็นภาษาไทย รับได้ทั้งแบบเดือน 2026-09 และแบบวัน 2026-09-25 */
function thaiLabel(label: string): string {
  const month = MONTH_SHORT[Number(label.slice(5, 7)) - 1];
  if (label.length > 7) return `${Number(label.slice(8))} ${month} ${thaiYear(label)}`;
  return `${month} ${thaiYear(label)}`;
}

/** ป้ายใต้แกนนอน ดูทั้งหมดบอกแค่ปี ดูปีเดียวบอกเดือน ดูรายวันบอกต้นเดือน */
function tickLabel(label: string, oneYear: boolean, first: boolean): string | null {
  const daily = label.length > 7;
  if (!oneYear) {
    return label.slice(5, 7) === "01" && (daily ? label.slice(8) === "01" : true)
      ? String(thaiYear(label))
      : first
        ? String(thaiYear(label))
        : null;
  }
  if (!daily) return MONTH_SHORT[Number(label.slice(5, 7)) - 1];
  return label.slice(8) === "01" ? MONTH_SHORT[Number(label.slice(5, 7)) - 1] : null;
}

type DustSeries = NonNullable<DustCasesData["dust_series"]>;
type DustSource = DustSeries["sources"][number];

/** สีของจุดตามระดับคุณภาพอากาศของค่านั้น ใช้เกณฑ์เดียวกับทั้งเว็บ */
function levelColor(value: number): string {
  if (value < 15) return BUCKET_COLORS["ดีมาก"];
  if (value < 25) return BUCKET_COLORS["ดี"];
  if (value < 37.5) return BUCKET_COLORS["ปานกลาง"];
  return BUCKET_COLORS["เกินมาตรฐาน"];
}

const ALL_YEARS = "ทั้งหมด";

/** ปีที่มีข้อมูลในแหล่งนั้น เรียงจากเก่าไปใหม่ */
function yearsOf(labels: string[]): string[] {
  return [...new Set(labels.map((label) => String(thaiYear(label))))].sort();
}

/** กราฟค่าฝุ่นย้อนหลัง เลือกแหล่งข้อมูล จังหวัด และปีได้
 *
 * ทำไมต้องเลือกจังหวัดได้
 *     ค่าเฉลี่ยทั้งประเทศไม่เคยเกินมาตรฐานสักเดือนเดียว ทั้งที่บางจังหวัดเกินหลายเดือนต่อปี
 *     การดูแต่ค่ารวมจึงทำให้เข้าใจผิดว่าไม่มีปัญหา
 *
 * ทำไมต้องเลือกปีได้
 *     ดูรวมทุกปีจะเห็นแต่จังหวะฤดูกาล ป้ายบอกได้แค่ปี อ่านไม่ออกว่าจุดไหนคือเดือนอะไร
 *     และแกนตั้งถูกยืดตามปีที่ฝุ่นสูงสุด ปีที่ฝุ่นน้อยจึงถูกบีบจนแบน
 *
 * ทำไมเลือกปีแล้วเปลี่ยนเป็นแท่ง
 *     พอเหลือสิบสองจุด แต่ละเดือนมีที่พอจะเป็นก้อนของตัวเอง สีของแท่งบอกระดับได้ทันที
 *     ส่วนมุมมองรวมมีห้าสิบจุด ถ้าทำเป็นแท่งจะบางจนอ่านไม่ออก จึงใช้เส้น
 */
function DustTrend({ data }: { data: DustSeries }) {
  const [sourceKey, setSourceKey] = useState(data.default_key);
  const [place, setPlace] = useState("ทั้งประเทศ");
  const [year, setYear] = useState(ALL_YEARS);

  const source: DustSource =
    data.sources.find((item) => item.key === sourceKey) ?? data.sources[0];
  const years = yearsOf(source.labels);

  // เปลี่ยนแหล่งแล้วจังหวัดหรือปีที่เลือกไว้อาจไม่มีในแหล่งใหม่ ถอยไปค่าตั้งต้นแทนการแสดงกราฟเปล่า
  const activePlace = place !== "ทั้งประเทศ" && !source.provinces[place] ? "ทั้งประเทศ" : place;
  const activeYear = year !== ALL_YEARS && !years.includes(year) ? ALL_YEARS : year;

  const all = activePlace === "ทั้งประเทศ" ? source.national : source.provinces[activePlace] ?? [];
  const picked = source.labels
    .map((label, index) => ({ label, value: all[index] }))
    .filter((item) => activeYear === ALL_YEARS || String(thaiYear(item.label)) === activeYear);

  const known = picked.filter((item): item is { label: string; value: number } => item.value != null);
  if (known.length < 2) return null;

  // เลือกปีแล้วจุดเหลือน้อยพอจะเป็นแท่งได้ ดูรวมทุกปีจุดเยอะเกินไป ต้องใช้เส้น
  const asBars = activeYear !== ALL_YEARS && known.length <= 14;
  const daily = source.granularity === "day";

  const width = 760;
  const height = 255;
  const left = 34;
  const right = 10;
  const top = asBars ? 18 : 14;
  const bottom = 34;

  const values = known.map((item) => item.value);
  const highest = Math.max(...values);
  const max = Math.max(40, Math.ceil(highest / 10) * 10);
  const stepGrid = max > 60 ? 20 : 10;
  const slot = (width - left - right) / picked.length;
  const x = (index: number) =>
    asBars ? left + index * slot + slot / 2 : left + (index * (width - left - right)) / (picked.length - 1);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);

  const gridlines: number[] = [];
  for (let line = 0; line <= max; line += stepGrid) gridlines.push(line);

  const path = picked
    .map((item, index) => (item.value == null ? null : `${x(index).toFixed(1)} ${y(item.value).toFixed(1)}`))
    .filter((item): item is string => item != null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");

  const lowest = Math.min(...values);
  const overStandard = values.filter((item) => item > data.thai_standard).length;
  const overWho = values.filter((item) => item > data.who_guideline).length;
  const peak = known[values.indexOf(highest)];
  const unit = daily ? "วัน" : "เดือน";

  const thresholds = [
    { value: data.thai_standard, color: BUCKET_COLORS["เกินมาตรฐาน"], label: `มาตรฐานไทย ${data.thai_standard}` },
    { value: data.who_guideline, color: BUCKET_COLORS["ดีมาก"], label: `WHO ${data.who_guideline}` },
  ].filter((item) => item.value <= max);

  return (
    <div className="dtrend">
      <div className="dtrend-sources">
        {data.sources.map((item) => (
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

      <div className="dtrend-head">
        <label className="dtrend-pick">
          <span>พื้นที่</span>
          <select value={activePlace} onChange={(event) => setPlace(event.target.value)}>
            <option value="ทั้งประเทศ">ทั้งประเทศ</option>
            {Object.keys(source.provinces).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="dtrend-years">
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
        </span>
      </div>

      <p className="dtrend-scope">
        {known.length} {unit} · {thaiLabel(known[0].label)} ถึง {thaiLabel(known[known.length - 1].label)}
      </p>

      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`ค่าฝุ่นย้อนหลังของ${activePlace}`}>
        {gridlines.map((value) => (
          <g key={value}>
            <line className="dtrend-grid" x1={left} y1={y(value)} x2={width - right} y2={y(value)} />
            <text className="dtrend-axis" x="4" y={y(value) + 3}>
              {value}
            </text>
          </g>
        ))}

        {asBars
          ? picked.map((item, index) =>
              item.value == null ? null : (
                <g key={item.label}>
                  <rect
                    x={left + index * slot + slot * 0.18}
                    y={y(item.value)}
                    width={slot * 0.64}
                    height={height - bottom - y(item.value)}
                    rx="3"
                    fill={levelColor(item.value)}
                    opacity="0.9"
                  >
                    <title>{`${thaiLabel(item.label)} · ${item.value} µg/m³`}</title>
                  </rect>
                  <text
                    className="dtrend-barvalue"
                    x={x(index)}
                    y={y(item.value) - 6}
                    textAnchor="middle"
                    fill={levelColor(item.value)}
                  >
                    {item.value}
                  </text>
                </g>
              ),
            )
          : null}

        {/* เส้นมาตรฐานวาดทับแท่ง จะได้เห็นว่าแท่งไหนโผล่พ้นเส้น */}
        {thresholds.map((item) => (
          <g key={item.label}>
            <line
              className="dtrend-threshold"
              x1={left}
              y1={y(item.value)}
              x2={width - right}
              y2={y(item.value)}
              stroke={item.color}
            />
            <text
              className="dtrend-threshold-text"
              x={width - right - 2}
              y={y(item.value) - 4}
              textAnchor="end"
              fill={item.color}
            >
              {item.label}
            </text>
          </g>
        ))}

        {!asBars && (
          <>
            <path className="dtrend-line" d={path} fill="none" strokeWidth={daily ? 1.3 : 1.75} strokeLinejoin="round" />
            {picked.map((item, index) =>
              item.value == null || (daily && activeYear === ALL_YEARS) ? null : (
                <circle key={item.label} cx={x(index)} cy={y(item.value)} r="2.6" fill={levelColor(item.value)} className="dtrend-dot">
                  <title>{`${thaiLabel(item.label)} · ${item.value} µg/m³`}</title>
                </circle>
              ),
            )}
          </>
        )}

        {picked.map((item, index) => {
          const label = tickLabel(item.label, activeYear !== ALL_YEARS, index === 0);
          return label ? (
            <text
              key={`tick-${item.label}`}
              className="dtrend-year"
              x={asBars ? x(index) : x(index) + (index ? 3 : 0)}
              y={height - bottom + 15}
              textAnchor={asBars ? "middle" : "start"}
            >
              {label}
            </text>
          ) : null;
        })}
      </svg>

      <div className="dtrend-stats">
        <div>
          <p className="dtrend-key">สูงสุด</p>
          <p className="dtrend-value" style={{ color: levelColor(highest) }}>
            {highest}
          </p>
          <p className="dtrend-unit">{thaiLabel(peak.label)}</p>
        </div>
        <div>
          <p className="dtrend-key">ต่ำสุด</p>
          <p className="dtrend-value" style={{ color: levelColor(lowest) }}>
            {lowest}
          </p>
          <p className="dtrend-unit">µg/m³</p>
        </div>
        <div>
          <p className="dtrend-key">เกินมาตรฐานไทย</p>
          <p className="dtrend-value">{overStandard}</p>
          <p className="dtrend-unit">จาก {known.length} {unit}</p>
        </div>
        <div>
          <p className="dtrend-key">เกินค่าแนะนำ WHO</p>
          <p className="dtrend-value">{overWho}</p>
          <p className="dtrend-unit">จาก {known.length} {unit}</p>
        </div>
      </div>
    </div>
  );
}

type Lagged = NonNullable<DustCasesData["lagged"]>;
type NextMonth = NonNullable<DustCasesData["next_month"]>;

/** ระดับคุณภาพอากาศของค่านั้น คืนลำดับที่ตรงกับ buckets ที่เซิร์ฟเวอร์ส่งมา */
function levelIndex(value: number): number {
  if (value < 15) return 0;
  if (value < 25) return 1;
  if (value < 37.5) return 2;
  return 3;
}

/** เอาค่าฝุ่นจริงของเดือนล่าสุดมาคำนวณว่าเดือนถัดไปแต่ละโรคจะเป็นอย่างไร
 *
 * ไม่ใช่สูตรใหม่ เป็นการหยิบค่าที่วัดได้จากข้อมูลย้อนหลังของระดับฝุ่นนั้นมาตอบ
 *
 * วาดแท่งเส้นประของกรณีฝุ่นเกินมาตรฐานซ้อนไว้ด้านหลังด้วย
 * เพราะถ้าเดือนล่าสุดเป็นหน้าฝนที่ฝุ่นต่ำทั้งประเทศ แท่งจริงจะเตี้ยหมดทั้งกระดาน
 * จนดูเหมือนฝุ่นไม่มีผลอะไร แท่งเส้นประทำให้เห็นว่าห่างจากกรณีแย่แค่ไหน
 */
function NextMonthPanel({
  data,
  lagged,
  severe,
  onSevere,
}: {
  data: NextMonth;
  lagged: Lagged;
  severe: boolean;
  onSevere: (value: boolean) => void;
}) {
  const [place, setPlace] = useState("ทั้งประเทศ");
  const dust = place === "ทั้งประเทศ" ? data.national_pm25 : data.provinces[place];
  if (dust == null) return null;

  const index = levelIndex(dust);
  const level = lagged.by_disease[0]?.buckets[index];
  const color = level ? BUCKET_COLORS[level.label_th] : "var(--text-dim)";

  // มุมมองความรุนแรงตัดโรคที่มีคนนอนโรงพยาบาลน้อยเกินไปออก ฐานเล็กจนตัวเลขแกว่ง
  const pool = severe ? lagged.by_disease.filter((item) => item.ipd_reliable) : lagged.by_disease;
  const bucketsOf = (item: Lagged["by_disease"][number]) =>
    severe ? item.ipd_buckets : item.buckets;

  // เรียงจากโรคที่ได้รับผลมากสุด โรคติดต่อไปอยู่ท้ายสุดเสมอเพราะไปคนละทิศ
  const diseases = [...pool].sort((a, b) => {
    if (a.infectious !== b.infectious) return a.infectious ? 1 : -1;
    return (bucketsOf(b)[index]?.change_pct ?? 0) - (bucketsOf(a)[index]?.change_pct ?? 0);
  });

  const width = 800;
  const height = 300;
  const left = 44;
  const right = 12;
  const top = 16;
  const bottom = 48;
  // มุมมองความรุนแรงมีทั้งค่าบวกที่สูงกว่าและค่าลบของโรคติดต่อที่ลึกกว่ามาก
  const spread = diseases.flatMap((item) => bucketsOf(item).map((bucket) => bucket.change_pct));
  const low = Math.min(-6, Math.floor(Math.min(...spread, 0) / 15) * 15);
  const high = Math.max(12, Math.ceil(Math.max(...spread, 0) / 15) * 15);
  const gridStep = high - low > 40 ? 15 : 3;
  const y = (value: number) => top + ((high - value) / (high - low)) * (height - top - bottom);
  const slot = (width - left - right) / diseases.length;
  const pad = slot * 0.2;
  const barWidth = slot - pad * 2;

  const gridlines: number[] = [];
  for (let line = low; line <= high; line += gridStep) gridlines.push(line);

  const affected = diseases.filter((item) => !item.infectious);
  const values = affected.map((item) => bucketsOf(item)[index]?.change_pct ?? 0);

  return (
    <>
      <div className="dnext-modes">
        <button type="button" className={severe ? "" : "is-on"} onClick={() => onSevere(false)}>
          ผู้ป่วยทั้งหมด
          <small>ทุกคนที่มารับบริการ</small>
        </button>
        <button type="button" className={severe ? "is-on" : ""} onClick={() => onSevere(true)}>
          เฉพาะที่ต้องนอนโรงพยาบาล
          <small>อาการหนักพอต้องรับเข้าเป็นผู้ป่วยใน</small>
        </button>
      </div>

      <p className="dnext-pick">
        พื้นที่
        <select value={place} onChange={(event) => setPlace(event.target.value)}>
          <option value="ทั้งประเทศ">ทั้งประเทศ (เฉลี่ย 77 จังหวัด)</option>
          {Object.keys(data.provinces).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </p>

      <div className="dnext-flow">
        <div className="dnext-box">
          <p className="dnext-key">{data.from_ym} · ค่าฝุ่นจริง</p>
          <p className="dnext-value" style={{ color }}>
            {dust.toFixed(1)}
          </p>
          <p className="dnext-unit">
            <span className="dnext-dot" style={{ background: color }} aria-hidden="true" />
            µg/m³ · ระดับ{level?.label_th}
          </p>
        </div>
        <span className="dnext-arrow" aria-hidden="true">
          →
        </span>
        <div className="dnext-box">
          <p className="dnext-key">{data.to_ym} · คาดการณ์</p>
          <p className="dnext-value" style={{ color }}>
            {signedPct(Math.min(...values))} ถึง {signedPct(Math.max(...values))}
          </p>
          <p className="dnext-unit">
            {severe ? "สัดส่วนผู้ป่วยในด้วยโรคจากฝุ่น" : "สัดส่วนผู้ป่วยโรคจากฝุ่น"} ต่างจากค่าปกติ
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`คาดการณ์สัดส่วนผู้ป่วยเดือน ${data.to_ym}`}>
        {gridlines.map((value) => (
          <g key={value}>
            <line
              className={value === 0 ? "dchart-zero" : "dchart-grid"}
              x1={left}
              y1={y(value)}
              x2={width - right}
              y2={y(value)}
            />
            <text className="dchart-axis" x={left - 6} y={y(value) + 3.5} textAnchor="end">
              {value > 0 ? `+${value}%` : `${value}%`}
            </text>
          </g>
        ))}

        {diseases.map((item, order) => {
          const own = bucketsOf(item);
          const now = own[index]?.change_pct ?? 0;
          const worst = own[own.length - 1]?.change_pct ?? 0;
          const x0 = left + order * slot + pad;
          const middle = x0 + barWidth / 2;
          return (
            <g key={item.disease}>
              {index !== own.length - 1 && (
                <rect
                  className="dnext-worst"
                  x={x0}
                  y={y(Math.max(0, worst))}
                  width={barWidth}
                  height={Math.max(1, y(Math.min(0, worst)) - y(Math.max(0, worst)))}
                  rx="3"
                >
                  <title>{`ถ้าฝุ่นเกินมาตรฐาน ${signedPct(worst)}`}</title>
                </rect>
              )}
              <rect
                x={x0 + 3}
                y={y(Math.max(0, now))}
                width={barWidth - 6}
                height={Math.max(1, y(Math.min(0, now)) - y(Math.max(0, now)))}
                rx="3"
                fill={color}
                opacity={item.infectious ? 0.5 : 0.9}
              >
                <title>{`${item.disease} · ${signedPct(now)}`}</title>
              </rect>
              <text
                className="dchart-value"
                x={middle}
                y={now >= 0 ? y(now) - 7 : y(now) + 15}
                textAnchor="middle"
                fill={color}
              >
                {signedPct(now)}
              </text>
              <text
                className={item.infectious ? "dnext-name-off" : "dnext-name"}
                x={middle}
                y={height - bottom + 19}
                textAnchor="middle"
              >
                {item.short_th}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="dchart-legend">
        <span className="dnext-legend-now" style={{ background: color }} aria-hidden="true" />
        คาดการณ์จากฝุ่นเดือน {data.from_ym} จริง
        <span className="dnext-legend-worst" aria-hidden="true" />
        ถ้าเดือนนั้นฝุ่นเกินมาตรฐาน
      </p>
    </>
  );
}

/** คำอธิบายใต้กรอบกราฟ วางแยกเพื่อให้ในกรอบเหลือแค่กราฟ */
function NextMonthNotes({
  data,
  lagged,
  severe,
}: {
  data: NextMonth;
  lagged: Lagged;
  severe: boolean;
}) {
  return (
    <>
      <p className="dcase-note">
        <strong>วิธีคำนวณ</strong> ดูว่าเดือน {data.from_ym} พื้นที่นั้นค่าฝุ่นอยู่ระดับไหน
        แล้วใช้ค่าที่วัดได้จากข้อมูลย้อนหลังว่าเดือนถัดจากเดือนที่ฝุ่นอยู่ระดับนั้น
        {severe ? lagged.measure_ipd_th : lagged.measure_th}สูงกว่าค่าปกติเฉลี่ยกี่เปอร์เซ็นต์
        ไม่ใช่สูตรใหม่
      </p>

      {severe && (
        <p className="dcase-good">
          <strong>มุมมองนี้บอกความรุนแรง ไม่ใช่แค่จำนวน</strong> เดือนที่ฝุ่นเกิน 25 µg/m³
          เดือนถัดไปสัดส่วนผู้ป่วยที่ต้องนอนโรงพยาบาลด้วยโรคหอบหืดสูงกว่าปกติ 14.0%
          เทียบกับ 8.0% เมื่อนับผู้ป่วยทั้งหมด แปลว่าฝุ่นไม่ได้ทำให้คนมาหาหมอมากขึ้นเฉย ๆ
          แต่ทำให้คนที่อาการหนักเพิ่มขึ้นด้วย
        </p>
      )}

      {severe && <p className="dcase-note">{lagged.ipd_note_th}</p>}

      <p className="dcase-note">
        เดือน {data.from_ym} แยกตามระดับได้{" "}
        {data.level_counts
          .filter((item) => item.provinces > 0)
          .map((item) => `${item.label_th} ${item.provinces} จังหวัด`)
          .join(" · ")}
      </p>

      <p className="dcase-good">
        <strong>รูปแบบเดียวกันทุกโรคที่ฝุ่นกระตุ้น</strong> ช่องว่างระหว่างแท่งทึบกับแท่งเส้นประ
        คือระยะห่างจากกรณีที่ฝุ่นเกินมาตรฐาน ซึ่งกว้างใกล้เคียงกันทุกโรค
        แปลว่าฝุ่นไม่ได้กระทบโรคใดโรคหนึ่งเป็นพิเศษ แต่กระทบทั้งกลุ่มพร้อมกัน
      </p>

      <p className="dcase-warn">{lagged.infectious_note_th}</p>

      {/* ต้องบอกว่าลองอะไรมาบ้างกว่าจะได้วิธีนี้
          ถ้าแสดงเฉพาะวิธีที่ได้ผล คนอ่านจะประเมินไม่ได้ว่าผลนี้น่าเชื่อแค่ไหน */}
      <details className="dcase-tried">
        <summary>วิธีวัดที่ลองแล้วไม่พบความสัมพันธ์ ({lagged.tried_th.length} แบบ)</summary>
        <ul>
          {lagged.tried_th.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          ผลนี้คำนวณครบทั้งเจ็ดโรคในชุดข้อมูล ไม่ได้เลือกเฉพาะโรคที่ผลออกมาดี
          โรคที่ฝุ่นกระตุ้นหกโรคขึ้นพร้อมกัน ส่วนโรคติดต่อลง
          การแยกตัวตามธรรมชาติของโรคเป็นหลักฐานที่หนักแน่นกว่าการเลือกโรคมาวิเคราะห์เอง
        </p>
      </details>

      <p className="dcase-warn">
        <strong>ข้อจำกัด</strong> {lagged.caveat_th} · และข้อมูลผู้ป่วยจริงมีถึงเดือน{" "}
        {/* ต้องบอกให้ชัดว่ายังตรวจคำตอบไม่ได้ ไม่งั้นจะถูกอ่านว่าเป็นค่าที่ยืนยันแล้ว */}
        ธันวาคม 2568 จึงยังตรวจคำตอบของเดือน {data.to_ym} ไม่ได้
        จนกว่าจะขอข้อมูลผู้ป่วยรอบใหม่
      </p>
    </>
  );
}

/** หน้าฝุ่นกับจำนวนผู้ป่วย
 *
 * เหลือสองส่วนตามที่ผู้ใช้ออกแบบ
 *     กราฟค่าฝุ่นรายเดือน ตอบได้ด้วยตัวเองว่าฝุ่นของพื้นที่นั้นเป็นอย่างไร
 *     แผงสองแท็บ ตอบว่าเดือนที่ฝุ่นสูงแล้วเดือนถัดไปสัดส่วนผู้ป่วยเปลี่ยนไปอย่างไร
 *
 * ส่วนที่เคยมีอยู่เดิมอย่างตารางสหสัมพันธ์ กราฟฤดูกาล ผลเจาะภาคเหนือ และการ์ดช่วงอายุ
 * ถูกนำออกจากหน้าเว็บ แต่ฝั่งเซิร์ฟเวอร์ยังคำนวณและส่งมาเหมือนเดิม
 * เพราะบทที่ 4 อ้างอิงตัวเลขชุดนั้นอยู่ และเอากลับมาแสดงได้ทันทีถ้าต้องการ
 */
export function DustCases() {
  const [data, setData] = useState<DustCasesData | null>(null);
  // ค่าฝุ่นเป็นแท็บตั้งต้น เพราะอ่านได้โดยไม่ต้องเข้าใจวิธีวิเคราะห์
  const [tab, setTab] = useState("dust");
  // มุมมองความรุนแรง อยู่ที่หน้าเพราะทั้งกราฟในกรอบและคำอธิบายใต้กรอบใช้ค่าเดียวกัน
  const [severe, setSevere] = useState(false);

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

  if (!data?.available) return null;

  return (
    <section className="dcase">
      {/* ยังติดป้ายเดโม เพราะค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง ไม่ใช่ค่าที่สถานีวัดได้
          และผลที่ได้ยังสรุปไม่ได้ว่าฝุ่นทำให้ป่วยมากขึ้นหรือไม่ */}
      <div className="fdemo-banner" role="note">
        <strong>หน้านี้เป็นเดโม ยังใช้สรุปผลไม่ได้</strong>
        <span>
          จำนวนผู้ป่วยเป็นข้อมูลจริงจากกรมควบคุมโรค แต่ค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง
          ไม่ใช่ค่าที่สถานีตรวจวัดได้ ผลที่ได้จึงใช้ดูวิธีวิเคราะห์เท่านั้น
        </span>
      </div>

      <div className="dcase-head">
        <h2 className="dcase-title">
          ฝุ่นกับจำนวนผู้ป่วยทั่วประเทศ <span className="fdemo-tag guess">เดโม</span>
        </h2>
        <span className="dcase-scope">
          {data.provinces} จังหวัด · ค่าฝุ่นถึง {data.pm_end} · ผู้ป่วยถึง {data.case_end}
        </span>
      </div>
      <p className="dcase-lead">
        ข้อมูลผู้ป่วยจริง {data.total_cases?.toLocaleString("th-TH")} ราย 7 กลุ่มโรค
        จับคู่กับค่าฝุ่นรายเดือนของจังหวัดเดียวกันได้ {data.pairs?.toLocaleString("th-TH")} คู่
      </p>

      {/* แท็บสองอันคุมพื้นที่กราฟผืนเดียว ตามที่ออกแบบไว้
          ค่าฝุ่นมาก่อน เพราะตอบได้ด้วยตัวเองโดยไม่ต้องพึ่งข้อมูลผู้ป่วย
          และครอบคลุมถึงเดือนล่าสุด ต่างจากแท็บที่สองที่หยุดอยู่ที่เดือนสุดท้ายของข้อมูลผู้ป่วย */}
      <div className="dcase-lagtabs">
        <button type="button" className={tab === "dust" ? "is-on" : ""} onClick={() => setTab("dust")}>
          ค่าฝุ่น
        </button>
        <button type="button" className={tab === "cases" ? "is-on" : ""} onClick={() => setTab("cases")}>
          เดือนหน้าจะมีผู้ป่วยจากค่าฝุ่นเท่าไหร่
        </button>
      </div>

      <div className="dcase-stage">
        {tab === "dust" && data.dust_series && <DustTrend data={data.dust_series} />}
        {tab === "cases" && data.lagged && data.next_month && (
          <NextMonthPanel
            data={data.next_month}
            lagged={data.lagged}
            severe={severe}
            onSevere={setSevere}
          />
        )}
      </div>

      {tab === "dust" && (
        <p className="dcase-note">
          ค่าเฉลี่ยทั้งประเทศไม่เคยเกินมาตรฐาน 37.5 สักเดือนเดียว ทั้งที่หลายจังหวัดเกิน
          หลายเดือนต่อปี เพราะค่าเฉลี่ยของ 77 จังหวัดกลบจังหวัดที่หนักจนหมด
          จึงต้องเลือกดูรายจังหวัด
        </p>
      )}
      {tab === "cases" && data.lagged && data.next_month && (
        <NextMonthNotes data={data.next_month} lagged={data.lagged} severe={severe} />
      )}

      <p className="dcase-source">
        ที่มา {data.disease_source_th} · {data.pm25_source_th} · {data.note_th}
      </p>
    </section>
  );
}
