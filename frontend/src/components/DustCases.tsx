import { useEffect, useState } from "react";
import type { DustCases as DustCasesData } from "../api";
import { api } from "../api";

/** เขียนค่าสหสัมพันธ์ให้มีเครื่องหมายบวกเสมอ อ่านง่ายกว่าเวลาอยู่ในตาราง */
function signed(value: number | null | undefined): string {
  if (value == null) return "—";
  return value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2).replace("-", "−");
}

/** ปี พ.ศ. จากคีย์เดือนแบบ 2024-01 */
function thaiYear(ym: string): number {
  return Number(ym.slice(0, 4)) + 543;
}

type Point = { month_th: string; pm25: number; cases: number };

/** กราฟเส้นสองชั้น ฝุ่นอยู่บน ผู้ป่วยอยู่ล่าง ใช้แกนนอนร่วมกัน
 *
 * ไม่วางสองเส้นในกราฟเดียวเพราะหน่วยคนละอย่าง ถ้าใช้แกนตั้งสองข้างจะบีบให้ดูเหมือน
 * สองเส้นสัมพันธ์กันตามที่คนวาดอยากให้เป็น การแยกสองชั้นบอกรูปร่างของแต่ละเส้นตามจริง
 */
function SeasonChart({ points }: { points: Point[] }) {
  const width = 680;
  const height = 96;
  const left = 34;
  const step = points.length > 1 ? (width - left - 10) / (points.length - 1) : 0;

  const path = (values: number[]) => {
    const top = Math.max(...values);
    const bottom = Math.min(...values);
    const span = top - bottom || 1;
    return values
      .map((value, index) => {
        const x = left + index * step;
        const y = height - 22 - ((value - bottom) / span) * (height - 40);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const dust = points.map((item) => item.pm25);
  const cases = points.map((item) => item.cases);

  return (
    <div className="dcase-chart">
      <p className="dcase-chart-label dust">ค่าฝุ่นเฉลี่ย µg/m³</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="ค่าฝุ่นเฉลี่ยรายเดือน">
        <path d={path(dust)} fill="none" stroke="var(--warn)" strokeWidth="2.5" />
        <text x="2" y="16" className="dcase-axis">
          {Math.max(...dust).toFixed(0)}
        </text>
        <text x="2" y={height - 20} className="dcase-axis">
          {Math.min(...dust).toFixed(0)}
        </text>
      </svg>

      <p className="dcase-chart-label cases">ผู้ป่วยเฉลี่ยต่อเดือน ทั้งประเทศ</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="จำนวนผู้ป่วยรายเดือน">
        <path d={path(cases)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <text x="2" y="16" className="dcase-axis">
          {(Math.max(...cases) / 1e6).toFixed(1)}ล
        </text>
        <text x="2" y={height - 20} className="dcase-axis">
          {(Math.min(...cases) / 1e6).toFixed(1)}ล
        </text>
      </svg>

      <div className="dcase-chart-months">
        {points.map((item) => (
          <span key={item.month_th}>{item.month_th}</span>
        ))}
      </div>
    </div>
  );
}

/** หน้าฝุ่นกับจำนวนผู้ป่วย
 *
 * ตอบคำถามเดียวคือ ฝุ่นมากแล้วคนป่วยมากขึ้นจริงไหม โดยคำนวณสดจากข้อมูลผู้ป่วยจริง
 * 7 กลุ่มโรค 77 จังหวัด สี่ปี ไม่ใช่ตัวเลขที่พิมพ์ไว้
 *
 * ลำดับการเล่าเรื่องตั้งใจให้อ่านได้โดยไม่ต้องรู้สถิติ
 *     กราฟฤดูกาลก่อน เห็นด้วยตาว่าฤดูฝุ่นกับฤดูป่วยไม่ใช่ฤดูเดียวกัน
 *     แล้วค่อยเป็นตารางสามมุม ให้เห็นว่าการควบคุมตัวแปรเปลี่ยนคำตอบอย่างไร
 *     ปิดท้ายด้วยข้อสรุปและกลุ่มอายุที่พบผู้ป่วยมากที่สุดของแต่ละโรค
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

  if (!data?.available) return null;

  const buckets = data.buckets ?? [];
  const most = Math.max(...buckets.map((item) => item.cases_per_month), 1);
  const overall = (data.correlations ?? []).find((row) => row.group === "รวมทุกโรค");

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
          {data.provinces} จังหวัด · {thaiYear(data.start ?? "")}–{thaiYear(data.end ?? "")}
        </span>
      </div>
      <p className="dcase-lead">
        ข้อมูลผู้ป่วยจริง {data.total_cases?.toLocaleString("th-TH")} ราย 7 กลุ่มโรค
        จับคู่กับค่าฝุ่นรายเดือนของจังหวัดเดียวกันได้ {data.pairs?.toLocaleString("th-TH")} คู่
      </p>

      <h3 className="dcase-sub">
        ฤดูฝุ่นกับฤดูป่วย ไม่ใช่ฤดูเดียวกัน<span>ค่าเฉลี่ยรายเดือนปฏิทิน</span>
      </h3>
      {data.seasonal && <SeasonChart points={data.seasonal} />}
      <p className="dcase-note">
        เดือนที่ฝุ่นสูงที่สุดคือช่วงต้นปี แต่ผู้ป่วยต่ำที่สุดในเดือนเมษายนซึ่งเป็นช่วงปิดเทอม
        และสงกรานต์ ส่วนเดือนที่ผู้ป่วยสูงที่สุดคือช่วงฤดูฝนซึ่งเป็นฤดูของโรคติดเชื้อ
      </p>

      <h3 className="dcase-sub">
        ผู้ป่วยเฉลี่ยต่อจังหวัดต่อเดือน แยกตามระดับฝุ่นของเดือนนั้น
        <span>{data.main_disease}</span>
      </h3>
      {buckets.map((item) => (
        <div className="dcase-bar" key={item.label_th}>
          <span className="dcase-bar-name">{item.label_th}</span>
          <span className="dcase-track">
            <span
              className="dcase-fill"
              style={{ width: `${(item.cases_per_month / most) * 100}%` }}
            />
          </span>
          <span className="dcase-bar-value">{item.cases_per_month.toLocaleString("th-TH")}</span>
        </div>
      ))}
      <p className="dcase-note">
        ช่วงค่าฝุ่นใช้ขอบเดียวกับระดับคุณภาพอากาศของไทย · ตัวเลขท้ายแถวคือผู้ป่วยเฉลี่ยของ
        หนึ่งจังหวัดในหนึ่งเดือนที่ฝุ่นอยู่ระดับนั้น
      </p>

      <h3 className="dcase-sub">
        ค่าความสัมพันธ์ 3 มุม<span>ยิ่งใกล้ 0 ยิ่งไม่เกี่ยวกัน</span>
      </h3>
      <div className="dcase-table-wrap">
        <table className="dcase-table">
          <thead>
            <tr>
              <th>กลุ่มโรค</th>
              <th>รวมทุกจังหวัด</th>
              <th>ในจังหวัดเดียวกัน</th>
              <th>ตัดฤดูกาลออก</th>
            </tr>
          </thead>
          <tbody>
            {(data.correlations ?? []).map((row) => (
              <tr key={row.group}>
                <td>{row.group.replace("โรค", "")}</td>
                <td className="dcase-num">{signed(row.pooled)}</td>
                <td className="dcase-num">{signed(row.within)}</td>
                <td className="dcase-num">{signed(row.deseasonal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dcase-note">
        <strong>รวมทุกจังหวัด</strong> เอาทุกจังหวัดมากองรวมกัน ค่าที่ได้สะท้อนขนาดจังหวัด ·{" "}
        <strong>ในจังหวัดเดียวกัน</strong> เทียบกับค่าปกติของจังหวัดนั้นเอง ·{" "}
        <strong>ตัดฤดูกาลออก</strong> เทียบเดือนเดียวกันข้ามปี
      </p>

      <p className="dcase-good">
        <strong>สิ่งที่การควบคุมตัวแปรแก้ได้</strong> ถ้าดูแบบในจังหวัดเดียวกันจะได้{" "}
        {signed(overall?.within)} ซึ่งถ้าอ่านตรง ๆ จะสรุปผิดว่าฝุ่นมากแล้วคนป่วยน้อยลง
        พอตัดฤดูกาลออกเหลือ {signed(overall?.deseasonal)} ค่าลบก้อนใหญ่หายไป
        ยืนยันว่าเป็นผลของฤดู ไม่ใช่ของฝุ่น
      </p>
      <p className="dcase-warn">
        <strong>ข้อสรุปตอนนี้</strong> ข้อมูลระดับจังหวัดรายเดือนชุดนี้
        ยังไม่พบความสัมพันธ์ระหว่างค่าฝุ่นกับจำนวนผู้ป่วย ทุกกลุ่มโรคอยู่ใกล้ศูนย์หลังตัดฤดูกาล
        · การไม่พบไม่ได้แปลว่าฝุ่นไม่มีผลต่อสุขภาพ แต่แปลว่าข้อมูลรายเดือนระดับจังหวัด
        หยาบเกินกว่าจะเห็นผลนั้น
      </p>

      {data.age_top && data.age_top.length > 0 && (
        <>
          <h3 className="dcase-sub">
            ช่วงอายุที่พบผู้ป่วยมากที่สุดของแต่ละโรค<span>รวมทุกจังหวัดทุกเดือน</span>
          </h3>
          <div className="dcase-ages">
            {data.age_top.map((item) => (
              <div className="dcase-age" key={item.disease}>
                <p className="dcase-age-name">{item.disease.replace("โรค", "")}</p>
                <p className="dcase-age-value">
                  {item.age_group} <span>{item.share_pct}%</span>
                </p>
                <p className="dcase-age-note">
                  {item.persons.toLocaleString("th-TH")} ราย จาก{" "}
                  {item.total.toLocaleString("th-TH")}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="dcase-source">
        ที่มา {data.disease_source_th} · {data.pm25_source_th} · {data.note_th}
      </p>
    </section>
  );
}
