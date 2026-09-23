import { useEffect, useState } from "react";
import type { AqiLevel, ForecastDemo as ForecastDemoData, ForecastIssue } from "../api";
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
/** เวลาที่ออกค่าพยากรณ์ เช่น 23 ก.ย. 14:31 */
function thaiStamp(text?: string): string {
  if (!text) return "-";
  const day = Number(text.slice(8, 10));
  const month = MONTHS[Number(text.slice(5, 7)) - 1];
  return `${day} ${month} ${text.slice(11, 16)}`;
}

function timeRange(start: string, end: string): string {
  return `${start.slice(11, 16)} – ${end.slice(11, 16)}`;
}

type DayCardProps = {
  title: string;
  /** ค่าที่ระบบออกไว้เป็นรอบ ถ้ามีจะใช้แทนค่าที่คำนวณสด */
  issued?: { pm25: number; start: string; end: string; level?: AqiLevel };
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
function DayCard({
  title,
  start,
  end,
  value,
  level,
  change,
  changeFrom,
  variant = "actual",
  issued,
}: DayCardProps) {
  // ค่าที่ออกไว้เป็นรอบมาก่อนเสมอ เพราะเป็นค่าที่ผู้ใช้เห็นทั้งวันและใช้วัดความแม่น
  // ค่าที่คำนวณสดใช้เฉพาะตอนที่ยังไม่ถึงรอบออกค่าของวันนี้
  const shownValue = issued?.pm25 ?? value;
  const shownStart = issued?.start ?? start;
  const shownEnd = issued?.end ?? end;
  const shownLevel = issued?.level ?? level;

  return (
    <article className={variant === "actual" ? "fdemo-day" : `fdemo-day ${variant}`}>
      <p className="fdemo-day-pill">{dateRange(shownStart, shownEnd)}</p>
      <div className="fdemo-day-body">
      <p className="card-label">{title}</p>
      <p className="fdemo-day-value">{shownValue != null ? shownValue.toFixed(1) : "-"}</p>
      <p className="card-unit">µg/m³</p>
      <p className="fdemo-level">
        <span
          className="fdemo-dot"
          style={{ background: shownLevel?.color ?? "var(--text-dim)" }}
          aria-hidden="true"
        />
        {shownLevel?.label_th ?? "-"}
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
      <p className="fdemo-day-pill time">{timeRange(shownStart, shownEnd)}</p>
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

  const [issue, setIssue] = useState<ForecastIssue | null>(null);

  // ค่าที่ระบบออกไว้เป็นรอบของจังหวัดนี้ ใช้แทนค่าที่คำนวณสดในการ์ดพยากรณ์
  // เพื่อให้ตัวเลขนิ่งทั้งวันและตรงกับค่าที่บันทึกไว้เทียบความแม่น
  useEffect(() => {
    let cancelled = false;
    setIssue(null);
    api
      .forecastIssue(province)
      .then((result) => {
        if (!cancelled) setIssue(result.available ? result : null);
      })
      .catch(() => {
        if (!cancelled) setIssue(null);
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
              issued={issue?.observed?.previous}
              start={ready.previous.start}
              end={ready.previous.end}
              value={ready.previous.pm25}
              level={ready.previous.level}
            />
            <DayCard
              title="24 ชม. ล่าสุด"
              issued={issue?.observed?.latest}
              start={ready.latest.start}
              end={ready.latest.end}
              value={ready.latest.pm25}
              level={ready.latest.level}
            />
            <DayCard
              title="พยากรณ์พรุ่งนี้"
              issued={issue?.targets?.tomorrow}
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
                issued={issue?.targets?.day_after}
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

          {/* บอกว่าค่าพยากรณ์นี้ออกเมื่อไรและรอบถัดไปเมื่อไร
              ตัวเลขไม่เปลี่ยนจนกว่าจะถึงรอบถัดไป คนเปิดเช้ากับเย็นจึงเห็นค่าเดียวกัน */}
          {issue?.available && (
            <div className="fdemo-issue">
              <span>
                ออกค่าพยากรณ์วันละครั้ง เวลา <strong>{issue.issue_hour}:00</strong> · ครั้งล่าสุด{" "}
                <strong>{thaiStamp(issue.issued_at)}</strong>
              </span>
              {issue.last_checked ? (
                <span className="fdemo-issue-check">
                  รอบก่อนทายไว้ <strong>{issue.last_checked.predicted.toFixed(1)}</strong> ค่าจริง{" "}
                  <strong>{issue.last_checked.actual.toFixed(1)}</strong> คลาด{" "}
                  <strong>{issue.last_checked.error.toFixed(1)}</strong>
                </span>
              ) : (
                <span className="fdemo-issue-check">รอค่าจริงของรอบนี้ในวันพรุ่งนี้</span>
              )}
            </div>
          )}

          {/* แถบความน่าเชื่อถือ วางใต้การ์ดทันที เพราะเป็นสิ่งที่ควรอ่านคู่กับตัวเลขพยากรณ์
              แสดงเลขของการเดาไว้ข้าง ๆ ด้วยเสมอ เพราะช่วงที่ทดสอบเป็นฤดูฝนที่ค่าฝุ่นนิ่ง
              ถ้าโชว์แต่เปอร์เซ็นต์ของระบบ จะทำให้เข้าใจว่าแม่นกว่าความจริง */}
          {ready.accuracy && (
            <div className="fdemo-trust">
              <div className="fdemo-trust-row">
                <div>
                  <span>ทายระดับถูก</span>
                  <strong>{ready.accuracy.level_hit_pct}%</strong>
                </div>
                <div>
                  <span>คลาดเฉลี่ย</span>
                  <strong>{ready.accuracy.rows.find((row) => row.current)?.mae.toFixed(2)}</strong>
                </div>
                <div>
                  <span>ถ้าเดาเฉย ๆ ได้</span>
                  <strong>{ready.accuracy.level_hit_base_pct}%</strong>
                </div>
              </div>
              <p className="fdemo-trust-note">
                ย้อนทดสอบ {ready.accuracy.cases.toLocaleString("th-TH")} จังหวัด-วัน จาก{" "}
                {ready.accuracy.provinces} จังหวัด ช่วง {ready.accuracy.period_th}{" "}
                ซึ่งเป็นฤดูฝนที่ค่าฝุ่นต่ำและนิ่ง
              </p>
            </div>
          )}

          <div className="fdemo-box">
            {/* เทียบว่าหน่วยงานที่พยากรณ์ฝุ่นจริงเขาใช้สูตรอะไร แล้วของระบบนี้ใช้อะไร
                เดิมตรงนี้เป็นขั้นตอนคำนวณทีละขั้นของสูตรเรา ซึ่งบอกว่าเลขมาจากไหน
                แต่ไม่ได้บอกว่าวิธีนี้อยู่ตรงไหนเมื่อเทียบกับงานพยากรณ์จริง
                ซึ่งเป็นคำถามที่สำคัญกว่าสำหรับหน้าที่ติดป้ายว่าเป็นเดโม
                สูตรเต็มและขั้นตอนยังอยู่ในกล่องดูที่มาและสูตรเต็มด้านล่าง */}
            {/* ความแม่นที่วัดได้ วางไว้ก่อนเรื่องหน่วยงาน เพราะเป็นคำถามแรกที่คนดูควรได้คำตอบ
                คือสูตรนี้ดีกว่าการไม่ทำอะไรหรือไม่ ตัวเลขมาจากการย้อนทดสอบกับข้อมูลที่ระบบเก็บเอง */}
            {ready.accuracy && (
              <>
                <h3 className="fdemo-box-title">
                  สูตรนี้แม่นแค่ไหน
                  <span className="fdemo-acc-scope">
                    ย้อนทดสอบ {ready.accuracy.cases.toLocaleString("th-TH")} จังหวัด-วัน ·{" "}
                    {ready.accuracy.provinces} จังหวัด · {ready.accuracy.period_th}
                  </span>
                </h3>

                {ready.accuracy.rows.map((row) => {
                  const worst = Math.max(...ready.accuracy!.rows.map((item) => item.mae));
                  return (
                    <div
                      className={row.current ? "fdemo-acc current" : "fdemo-acc"}
                      key={row.name_th}
                    >
                      <span className="fdemo-acc-name">{row.name_th}</span>
                      <span className="fdemo-acc-track">
                        <span
                          className="fdemo-acc-fill"
                          style={{ width: `${(row.mae / worst) * 100}%` }}
                        />
                      </span>
                      <span className="fdemo-acc-value">{row.mae.toFixed(2)}</span>
                    </div>
                  );
                })}

                <p className="fdemo-legend-note">{ready.accuracy.note_th}</p>
              </>
            )}

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
