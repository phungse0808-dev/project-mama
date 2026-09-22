import { useEffect, useState } from "react";
import type { DustCases as DustCasesData } from "../api";
import { api } from "../api";

/** เดือนแบบไทยของวันที่รูปแบบ 2023-08-31 ใช้บอกช่วงข้อมูล */
const MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function thaiMonth(text: string): string {
  const [year, month] = text.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(year) + 543}`;
}

/** วันที่แบบไทยของเวลาที่เซิร์ฟเวอร์ส่งมา ใช้บอกว่านำเข้าข้อมูลเมื่อไร */
function thaiDate(text: string): string {
  const day = new Date(text);
  if (Number.isNaN(day.getTime())) return text;
  return `${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear() + 543}`;
}

/** เครื่องหมายลบแบบยูนิโคด ให้ตรงกับที่ใช้ในตาราง ไม่ใช่ขีดสั้นของแป้นพิมพ์ */
function minus(value: number): string {
  return String(value).replace("-", "−");
}

/** เขียนค่าสหสัมพันธ์ให้มีเครื่องหมายบวกเสมอ อ่านง่ายกว่าเวลาอยู่ในตาราง */
function signed(value: number | null | undefined): string {
  if (value == null) return "—";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2).replace("-", "−");
}

/** แผงฝุ่นกับจำนวนผู้ป่วย ต่อท้ายคำแนะนำในหน้าโรคจากฝุ่น
 *
 * ตอบคำถามที่คนดูอยากรู้ต่อจากคำแนะนำ คือฝุ่นมากแล้วคนป่วยมากขึ้นจริงไหม
 * โดยแสดงผลการวิเคราะห์ที่ระบบคำนวณเองจากข้อมูลผู้ป่วยจริง ไม่ใช่ตัวเลขที่พิมพ์ไว้
 *
 * ลำดับการเล่าเรื่องตั้งใจให้อ่านได้โดยไม่ต้องรู้สถิติ
 *     กราฟแท่งก่อน เห็นด้วยตาว่าเส้นแบน
 *     แล้วค่อยเป็นตารางตัวเลขสำหรับคนที่อยากดูละเอียด
 *     ปิดท้ายด้วยเหตุผลว่าทำไมต้องตัดวันหยุด และข้อสรุปว่ายังสรุปไม่ได้
 */
export function DustCases() {
  const [data, setData] = useState<DustCasesData | null>(null);

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

  // ไม่ขึ้นอะไรเลยเมื่อยังไม่มีข้อมูล เพราะแผงนี้เป็นส่วนเสริมของหน้า ไม่ใช่เนื้อหาหลัก
  if (!data?.available) return null;

  const buckets = data.buckets ?? [];
  const most = Math.max(...buckets.map((item) => item.cases_per_day), 1);
  const busiest = Math.max(data.workday_cases ?? 0, data.holiday_cases ?? 0, 1);
  const overPercent =
    data.total_days && data.over_standard_days != null
      ? Math.round((data.over_standard_days / data.total_days) * 100)
      : null;

  return (
    <section className="dcase">
      {/* ทั้งหน้าเป็นเดโม ใช้แบนเนอร์แบบเดียวกับหน้าพยากรณ์ให้ผู้ใช้จำรูปแบบได้
          เหตุผลที่ยังเป็นเดโม ค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง ไม่ใช่ค่าที่สถานีวัดได้
          ข้อมูลผู้ป่วยมีแค่ 5 จังหวัด 8 เดือน และผลวิเคราะห์ยังสรุปความสัมพันธ์ไม่ได้ */}
      <div className="fdemo-banner" role="note">
        <strong>หน้านี้ทั้งหมดเป็นเดโม ยังใช้งานจริงไม่ได้ และยังใช้สรุปผลไม่ได้</strong>
        <span>
          จำนวนผู้ป่วยเป็นข้อมูลจริงจากกรมควบคุมโรค แต่ค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง
          และข้อมูลครอบคลุมเพียง 5 จังหวัด 8 เดือน ผลที่ได้จึงใช้ดูวิธีวิเคราะห์เท่านั้น
          ยังสรุปไม่ได้ว่าฝุ่นทำให้ป่วยมากขึ้นหรือไม่
        </span>
      </div>

      <div className="dcase-head">
        <h2 className="dcase-title">
          ฝุ่นกับจำนวนผู้ป่วยในพื้นที่ <span className="fdemo-tag guess">เดโม</span>
        </h2>
        <span className="dcase-scope">
          {data.provinces?.length ?? 0} จังหวัด ·{" "}
          {data.start && data.end ? `${thaiMonth(data.start)}–${thaiMonth(data.end)}` : ""}
        </span>
      </div>
      <p className="dcase-lead">
        ข้อมูลผู้ป่วยจริง {data.total_cases?.toLocaleString("th-TH")} ราย จาก{data.source_th}{" "}
        ระบบนำมาเทียบกับค่าฝุ่นของวันเดียวกันเพื่อดูว่าสัมพันธ์กันหรือไม่
      </p>

      <h3 className="dcase-sub">
        ผู้ป่วยเฉลี่ยต่อวันทำการ แยกตามระดับฝุ่นของวันนั้น
        <span>{data.main_group}</span>
      </h3>
      {buckets.map((item) => (
        <div className="dcase-bar" key={item.label_th}>
          <span className="dcase-bar-name">{item.label_th}</span>
          <span className="dcase-track">
            <span
              className="dcase-fill"
              style={{ width: `${(item.cases_per_day / most) * 100}%` }}
            />
          </span>
          <span className="dcase-bar-value">{item.cases_per_day}</span>
        </div>
      ))}
      <p className="dcase-note">
        ช่วงค่าฝุ่นใช้ขอบเดียวกับระดับคุณภาพอากาศของไทย นับเฉพาะวันที่มีข้อมูลครบ
      </p>

      <h3 className="dcase-sub">
        ค่าความสัมพันธ์<span>ยิ่งใกล้ 0 ยิ่งไม่เกี่ยวกัน</span>
      </h3>
      <div className="dcase-table-wrap">
        <table className="dcase-table">
          <thead>
            <tr>
              <th>กลุ่มโรค</th>
              <th>ทุกวัน</th>
              <th>ตัดวันหยุด</th>
              <th>รายสัปดาห์</th>
            </tr>
          </thead>
          <tbody>
            {(data.correlations ?? []).map((row) => (
              <tr key={row.group}>
                <td>{row.group.replace("กลุ่มโรค", "")}</td>
                <td className="dcase-num">{signed(row.all_days)}</td>
                <td className="dcase-num">{signed(row.workday)}</td>
                <td className="dcase-num">{signed(row.weekly)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="dcase-sub">
        ทำไมต้องตัดวันหยุดออกก่อน<span>ผู้ป่วยเฉลี่ยต่อวัน</span>
      </h3>
      <div className="dcase-bar">
        <span className="dcase-bar-name">วันทำการ</span>
        <span className="dcase-track">
          <span
            className="dcase-fill"
            style={{ width: `${((data.workday_cases ?? 0) / busiest) * 100}%` }}
          />
        </span>
        <span className="dcase-bar-value">{data.workday_cases}</span>
      </div>
      <div className="dcase-bar">
        <span className="dcase-bar-name">เสาร์อาทิตย์</span>
        <span className="dcase-track">
          <span
            className="dcase-fill dim"
            style={{ width: `${((data.holiday_cases ?? 0) / busiest) * 100}%` }}
          />
        </span>
        <span className="dcase-bar-value">{data.holiday_cases}</span>
      </div>
      <p className="dcase-note">
        ข้อมูลนับจากวันที่ผู้ป่วยเข้ารับบริการ วันที่สถานพยาบาลปิดจึงมีผู้ป่วยน้อย
        โดยไม่เกี่ยวกับค่าฝุ่น
      </p>

      <p className="dcase-good">
        <strong>สิ่งที่การตัดวันหยุดแก้ได้</strong> ถ้าดูรายเดือนโดยไม่ตัดวันหยุด
        จะได้ค่า {signed(data.monthly_correlation)} ซึ่งแปลผิดว่าฝุ่นมากแล้วป่วยน้อยลง
        พอตัดออกเหลือ {signed(data.workday_correlation)}
      </p>
      <p className="dcase-warn">
        <strong>ข้อสรุปตอนนี้ (เดโม)</strong> ยังไม่พบความสัมพันธ์ระหว่างค่าฝุ่นกับจำนวนผู้ป่วย
        {overPercent != null
          ? ` เพราะช่วงข้อมูลที่มีมีวันที่ฝุ่นเกินมาตรฐานเพียงร้อยละ ${overPercent} และยังไม่ครอบคลุมฤดูหนาว`
          : ""}
      </p>

      {/* วิธีคำนวณ พับเก็บไว้เพราะคนส่วนใหญ่อ่านแค่ผล แต่คนที่จะตรวจต้องกางดูได้
          ตัวอย่างที่แสดงเป็นช่วงที่ฝุ่นสูงที่สุดในข้อมูล ซึ่งได้ค่าต่างจากค่ารวมมาก
          จงใจเลือกช่วงนี้เพื่อให้เห็นว่าหยิบมาไม่กี่วันแล้วสรุปไม่ได้ */}
      {data.method && (
        <details className="dcase-how">
          <summary>ค่าเหล่านี้คำนวณอย่างไร</summary>

          <p className="dcase-note">
            จับคู่ตัวเลขสองตัวของแต่ละจังหวัดในแต่ละวัน คือค่าฝุ่นเฉลี่ยของวันนั้น
            กับจำนวนผู้ป่วยของวันนั้น แล้วใส่สูตรสหสัมพันธ์แบบเพียร์สัน
          </p>

          <ul className="dcase-pairs">
            {data.method.pairs.map((item) => (
              <li key={item.label_th}>
                <strong>{item.label_th}</strong> {item.detail_th} ·{" "}
                {item.count.toLocaleString("th-TH")} คู่
              </li>
            ))}
          </ul>

          <p className="dcase-formula">{data.method.formula}</p>
          <p className="dcase-note">{data.method.reading_th}</p>

          {data.method.example && (
            <>
              <h3 className="dcase-sub">
                ตัวอย่างคำนวณจริง
                <span>
                  {data.method.example.province} · {data.method.example.group} · 5 วันที่ฝุ่นสูงที่สุด
                </span>
              </h3>
              <div className="dcase-table-wrap">
                <table className="dcase-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>ฝุ่น</th>
                      <th>ผู้ป่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.method.example.points.map((point) => (
                      <tr key={point.day}>
                        <td>{thaiDate(point.day)}</td>
                        <td className="dcase-num">{point.pm25}</td>
                        <td className="dcase-num">{point.cases}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="dcase-formula">
                เฉลี่ยฝุ่น {data.method.example.mean_pm25} · เฉลี่ยผู้ป่วย{" "}
                {data.method.example.mean_cases} · ตัวบน {minus(data.method.example.top)} · ตัวล่าง{" "}
                {minus(data.method.example.bottom)} · r = {signed(data.method.example.r)}
              </p>
              <p className="dcase-note">
                ห้าวันนี้ได้ค่า {signed(data.method.example.r)} ซึ่งต่างจากค่ารวมทั้งชุดที่{" "}
                {signed(data.workday_correlation)} มาก เพราะข้อมูลไม่กี่วันแกว่งได้ง่าย
                จึงต้องดูทั้งชุด ไม่ใช่หยิบบางช่วงมาสรุป
              </p>
            </>
          )}
        </details>
      )}

      {/* กล่องที่มา แยกสองแหล่งให้ชัด เพราะสองแหล่งนี้เชื่อถือได้ไม่เท่ากัน
          จำนวนผู้ป่วยเป็นข้อมูลจริงจากหน่วยงานรัฐ ส่วนค่าฝุ่นย้อนหลังเป็นค่าจากแบบจำลอง
          ถ้าเขียนรวมบรรทัดเดียวคนอ่านจะเข้าใจว่าทั้งสองอย่างเป็นค่าตรวจวัดจริง */}
      <div className="dcase-src">
        <h3 className="dcase-sub">ข้อมูลนี้มาจากไหน เป็นของปีอะไร</h3>

        <div className="dcase-src-row">
          <span className="dcase-src-tag ok">ข้อมูลจริง</span>
          <div>
            <p className="dcase-src-name">
              จำนวนผู้ป่วย ปี {Number(data.start?.slice(0, 4) ?? 0) + 543} · {data.source_th}
            </p>
            <p className="dcase-src-note">
              {data.source_detail_th} · {data.source_note_th}
              {data.imported_at ? ` · ระบบนำเข้าเมื่อ ${thaiDate(data.imported_at)}` : ""}
            </p>
            {data.source_url && (
              <a className="dcase-src-link" href={data.source_url} target="_blank" rel="noreferrer">
                เปิดหน้าข้อมูลเปิดของกรมควบคุมโรค
              </a>
            )}
          </div>
        </div>

        <div className="dcase-src-row">
          <span className="dcase-src-tag warn">ค่าจากแบบจำลอง</span>
          <div>
            <p className="dcase-src-name">ค่าฝุ่น ปี 2566 · {data.pm25_source_th}</p>
            <p className="dcase-src-note">{data.pm25_note_th}</p>
            {data.pm25_source_url && (
              <a
                className="dcase-src-link"
                href={data.pm25_source_url}
                target="_blank"
                rel="noreferrer"
              >
                เปิดเอกสารของ Open-Meteo
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
