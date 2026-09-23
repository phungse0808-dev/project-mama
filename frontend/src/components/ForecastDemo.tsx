import { useEffect, useState } from "react";
import type { AqiLevel, ForecastDemo as ForecastDemoData } from "../api";
import { api } from "../api";

type Props = {
  provinces: string[];
  defaultProvince: string;
};

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ป้ายบนของการ์ด วัน เดือน ปี พ.ศ. ของช่วง เช่น 16–17 ก.ย. 2569 หรือ 30 ก.ย.–1 ต.ค. 2569 */
function dateRange(start: string, end: string): string {
  const [sy, sm, sd] = start.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = end.slice(0, 10).split("-").map(Number);
  if (sy === ey && sm === em && sd === ed) return `${sd} ${MONTHS[sm - 1]} ${sy + 543}`;
  if (sy === ey && sm === em) return `${sd}–${ed} ${MONTHS[sm - 1]} ${ey + 543}`;
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]} ${ey + 543}`;
  return `${sd} ${MONTHS[sm - 1]} ${sy + 543}–${ed} ${MONTHS[em - 1]} ${ey + 543}`;
}

/** ป้ายล่างของการ์ด เวลาเริ่ม – เวลาจบของช่วง */
function timeRange(start: string, end: string): string {
  return `${start.slice(11, 16)} – ${end.slice(11, 16)}`;
}

type DayCardProps = {
  title: string;
  /** ช่วงของการ์ด เวลาไทย เช่น 2026-09-16T15:00 */
  start: string;
  end: string;
  value: number | null;
  level: AqiLevel | null;
  /** ส่วนต่างจากช่วงก่อนหน้า มีเฉพาะการ์ดพยากรณ์ */
  change?: number;
  /** ชื่อช่วงที่ใช้เทียบ change */
  changeFrom?: string;
  variant?: "actual" | "forecast" | "further";
};

/** การ์ดสูงหนึ่งใบ บอกค่าฝุ่นเฉลี่ยหนึ่งช่วง */
/** การ์ดสูงหนึ่งใบตามแบบที่วาดไว้ ป้ายบนวันเดือนปี ค่าตรงกลาง ป้ายล่างเวลาที่ใช้ */
function DayCard({ title, start, end, value, level, change, changeFrom, variant = "actual" }: DayCardProps) {
  return (
    <article className={variant === "actual" ? "fdemo-day" : `fdemo-day ${variant}`}>
      <p className="fdemo-day-pill">{dateRange(start, end)}</p>
      <div className="fdemo-day-body">
      <p className="card-label">{title}</p>
      <p className="fdemo-day-value">{value != null ? value.toFixed(1) : "-"}</p>
      <p className="card-unit">µg/m³</p>
      <p className="fdemo-level">
        <span className="fdemo-dot" style={{ background: level?.color ?? "var(--text-dim)" }} aria-hidden="true" />
        {level?.label_th ?? "-"}
      </p>
      {change != null && (
        <p className="fdemo-change">
          {change === 0
            ? `เท่ากับ${changeFrom ?? ""}`
            : `${change < 0 ? "ลดลง" : "เพิ่มขึ้น"} ${Math.abs(change).toFixed(1)} จาก${changeFrom ?? ""}`}
        </p>
      )}
      {/* ทั้งหน้าเป็นเดโม ทุกการ์ดจึงติดป้าย */}
      <span className="fdemo-tag guess">เดโม</span>
      </div>
      <p className="fdemo-day-pill time">{timeRange(start, end)}</p>
    </article>
  );
}

/** หน้าพยากรณ์ค่าฝุ่นแบบเดโม
 *
 * คำนวณจากค่าเฉลี่ย 24 ชม. สองช่วงล่าสุดกับสภาพอากาศ ตามสูตรใน backend/app/forecast_demo.py
 * ข้อมูลเป็นค่าจริง แต่สูตรยังไม่ได้ทดสอบความแม่น จึงติดป้ายเดโมทั้งหน้า
 * ขั้นคำนวณแสดงแบบย่อให้อ่านง่าย ที่มา สูตรเต็ม และเอกสารอ้างอิงซ่อนไว้ กดเปิดดูได้
 */
export function ForecastDemo({ provinces, defaultProvince }: Props) {
  const [province, setProvince] = useState(defaultProvince);
  const [data, setData] = useState<ForecastDemoData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    api
      .forecastDemo(province)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [province]);

  const ready =
    data?.available && data.latest && data.previous && data.tomorrow && data.steps ? data : null;

  return (
    <section className="fdemo">
      <div className="fdemo-banner" role="note">
        <strong>หน้านี้ทั้งหมดเป็นเดโม ยังใช้งานจริงไม่ได้</strong>
        <span>
          ข้อมูลเป็นค่าจริง สูตรผู้จัดทำออกแบบเองเพื่อสาธิต บางส่วนมีงานวิจัยรองรับ
          ยังไม่ได้ทดสอบความแม่น อย่าใช้ตัดสินใจ
        </span>
      </div>

      <div className="fdemo-head">
        <h2 className="fdemo-title">
          พยากรณ์ฝุ่น <span className="fdemo-tag guess">เดโม</span>
        </h2>
        <label className="card-group-picker">
          <span className="sr-only">เลือกจังหวัด</span>
          <select value={province} onChange={(event) => setProvince(event.target.value)}>
            {provinces.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {failed && <p className="empty">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</p>}
      {!data && !failed && <p className="empty">กำลังคำนวณ...</p>}
      {data && !ready && <p className="empty">{data.reason ?? "ข้อมูลไม่พอสำหรับคำนวณ"}</p>}

      {ready && ready.latest && ready.previous && ready.tomorrow && ready.steps && (
        <>
          {/* การ์ดสูงสี่ใบ 24 ชม. ก่อนหน้า 24 ชม. ล่าสุด พยากรณ์พรุ่งนี้ พยากรณ์มะรืน */}
          <div className="fdemo-panel">
            <DayCard
              title="24 ชม. ก่อนหน้า"
              start={ready.previous.start}
              end={ready.previous.end}
              value={ready.previous.pm25}
              level={ready.previous.level}
            />
            <DayCard
              title="24 ชม. ล่าสุด"
              start={ready.latest.start}
              end={ready.latest.end}
              value={ready.latest.pm25}
              level={ready.latest.level}
            />
            <DayCard
              title="พยากรณ์พรุ่งนี้"
              start={ready.tomorrow.start}
              end={ready.tomorrow.end}
              value={ready.tomorrow.pm25}
              level={ready.tomorrow.level}
              change={ready.tomorrow.change}
              changeFrom=" 24 ชม. ล่าสุด"
              variant="forecast"
            />
            {ready.day_after && (
              <DayCard
                title="พยากรณ์มะรืนนี้"
                start={ready.day_after.start}
                end={ready.day_after.end}
                value={ready.day_after.pm25}
                level={ready.day_after.level}
                change={ready.day_after.change}
                changeFrom="พรุ่งนี้"
                variant="further"
              />
            )}
          </div>

          <div className="fdemo-box">
            {/* เทียบว่าหน่วยงานที่พยากรณ์ฝุ่นจริงเขาใช้สูตรอะไร แล้วของระบบนี้ใช้อะไร
                เดิมตรงนี้เป็นขั้นตอนคำนวณทีละขั้นของสูตรเรา ซึ่งบอกว่าเลขมาจากไหน
                แต่ไม่ได้บอกว่าวิธีนี้อยู่ตรงไหนเมื่อเทียบกับงานพยากรณ์จริง
                ซึ่งเป็นคำถามที่สำคัญกว่าสำหรับหน้าที่ติดป้ายว่าเป็นเดโม
                สูตรเต็มและขั้นตอนยังอยู่ในกล่องดูที่มาและสูตรเต็มด้านล่าง */}
            <h3 className="fdemo-box-title">หน่วยงานที่พยากรณ์ฝุ่น ใช้สูตรอะไร</h3>

            <ul className="fdemo-agencies">
              {(ready.agencies ?? []).map((agency) => (
                <li key={agency.url}>
                  <strong>
                    {agency.name_th}
                    <span className={`fdemo-use ${agency.use}`}>
                      {agency.use === "use"
                        ? "ระบบนี้ใช้ข้อมูล"
                        : agency.use === "ref"
                          ? "อ้างอิงวิธีคิด"
                          : "ไม่ได้ใช้"}
                    </span>
                  </strong>
                  <span className="fdemo-agency-system">{agency.system_th}</span>
                  <span>{agency.method_th}</span>
                  <code className="fdemo-agency-formula">{agency.formula}</code>
                  {agency.formula_note_th && (
                    <span className="fdemo-agency-system">{agency.formula_note_th}</span>
                  )}
                  <span className="fdemo-agency-system">{agency.use_th}</span>
                  <a href={agency.url} target="_blank" rel="noreferrer">
                    {agency.url.replace(/^https?:\/\//, "").split("/")[0]}
                  </a>
                </li>
              ))}
            </ul>

            {ready.our_method_th && (
              <div className="fdemo-our-method">
                <strong>สูตรของระบบนี้ (เดโม)</strong>
                <code className="fdemo-agency-formula">{ready.our_formula}</code>
                <p>{ready.our_method_th}</p>
              </div>
            )}

            {ready.mass_balance_note_th && (
              <p className="fdemo-legend-note">{ready.mass_balance_note_th}</p>
            )}

            {/* รายละเอียดทั้งหมดซ่อนไว้ ถ้าอาจารย์หรือผู้อ่านอยากตรวจ กดเปิดดูได้ */}
            <details className="fdemo-more">
              <summary>ดูที่มาและสูตรเต็ม</summary>

              <p className="fdemo-more-head">ที่มาของสูตร</p>
              <p>
                โครงสูตรผู้จัดทำออกแบบเองเพื่อสาธิต ไม่ได้ยกมาจากเอกสารใด แนวคิดคือใช้ค่าล่าสุดเป็นฐาน
                บวกแนวโน้ม แล้วปรับตามสภาพอากาศ ทิศทางของผลสภาพอากาศอ้างอิงจากงานวิจัยตามเลขในวงเล็บ
                ตัวเลขที่ไม่มีเลขอ้างอิงผู้จัดทำกำหนด
              </p>

              <p className="fdemo-more-head">สูตรเต็ม</p>
              <ol className="fdemo-formula">
                {ready.formula.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>

              <p className="fdemo-more-head">ที่มาของข้อมูล</p>
              <p>ค่าฝุ่น: {ready.pm25_source}</p>
              <p>สภาพอากาศ: {ready.weather_source}</p>

              <p className="fdemo-more-head">เอกสารอ้างอิง</p>
              <ol className="fdemo-refs">
                {ready.references.map((ref) => (
                  <li key={ref.id} value={ref.id}>
                    {ref.text}{" "}
                    <a href={ref.url} target="_blank" rel="noreferrer">
                      {ref.url.replace("https://", "")}
                    </a>
                  </li>
                ))}
              </ol>

              <p className="fdemo-more-head">ข้อจำกัด</p>
              <p>
                งานวิจัยเรื่องฝนวัดที่ญี่ปุ่นและฮ่องกง เป็นผลรายชั่วโมง ไม่ใช่ค่าเฉลี่ยทั้งวันในไทย ·
                มะรืนคิดต่อจากค่าที่พยากรณ์อีกทอด ความคลาดเคลื่อนสะสม · ยังไม่ได้วัดความแม่นกับค่าจริง
              </p>
            </details>
          </div>
        </>
      )}
    </section>
  );
}
