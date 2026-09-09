import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { DiseaseSummary } from "../api";

/** สีของแท่งกับเส้นในกราฟรายเดือน
 *
 * ใช้สองสีที่ต่างกันชัด เพราะเป็นคนละหน่วยและอยู่คนละแกน
 * แท่งคือจำนวนคน เส้นคือมิลลิเมตรฝน ถ้าใช้สีใกล้กันจะอ่านว่าเป็นชุดเดียวกัน
 */
const CASE_COLOR = "#0b6bcb";
const RAIN_COLOR = "#15607a";

/** สีของแถบในรายการแยกกลุ่มโรคและแยกจังหวัด
 *
 * ชุดเดียวกับที่แผงความเสี่ยงใช้ กลุ่มโรคเดียวกันจะได้เป็นสีเดิมทั้งสองที่
 */
const GROUP_COLORS = ["#0b6bcb", "#15607a", "#c62b45", "#a13d7a", "#9c5c07"];

function thousands(value: number): string {
  return value.toLocaleString("th-TH");
}

/**
 * ผู้ป่วยจริงจากกรมควบคุมโรค
 *
 * ทำไมต้องมีแผงนี้
 *     ระบบดึงข้อมูลชุดนี้มาเก็บไว้ตั้งแต่แรกและมีอยู่ในฐานข้อมูลครบ
 *     แต่ไม่เคยได้แสดงบนหน้าเว็บเลยสักครั้ง คนใช้จึงไม่รู้ว่ามีอยู่
 *     ทั้งที่เป็นข้อมูลผู้ป่วยจริงของไทยชุดเดียวที่ระบบมี
 *     ส่วนที่เหลือทั้งหมดเป็นค่าสัมประสิทธิ์ที่ยืมมาจากงานวิจัยต่างประเทศ
 *
 * ข้อจำกัดที่ต้องบอกทุกครั้ง
 *     ข้อมูลผู้ป่วยเป็นปี 2566 ส่วนค่าฝุ่นที่ระบบเก็บเริ่มปี 2569
 *     สองชุดไม่ทับกันเลยสักวัน จึงคำนวณความสัมพันธ์ระหว่างกันไม่ได้
 *     การวางคู่กับปริมาณฝนเป็นการเปรียบเทียบเชิงพรรณนา ไม่ใช่การพิสูจน์เชิงสาเหตุ
 */
export function DiseaseCases() {
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

  if (!data?.available) return null;

  const monthly = data.monthly ?? [];
  const byGroup = data.by_group ?? [];
  const byProvince = data.by_province ?? [];

  // แถบยาวเทียบกับค่าสูงสุดของชุดตัวเอง ไม่ใช่เทียบกับผลรวม
  //
  // เทียบกับผลรวมแล้วแถบจะสั้นจนดูไม่ออกว่าต่างกัน
  // เพราะกลุ่มที่มากที่สุดยังไม่ถึงครึ่งของยอดรวม
  const groupPeak = Math.max(...byGroup.map((item) => item.cases), 1);
  const provincePeak = Math.max(...byProvince.map((item) => item.cases), 1);

  const series = monthly.map((month) => ({
    label: month.label,
    ผู้ป่วย: month.total,
    ฝน: month.rainfall_mm,
  }));

  return (
    <section className="panel">
      <h2 className="panel-title">
        ผู้ป่วยจริงจากกรมควบคุมโรค
        <span className="panel-hint">{data.source}</span>
      </h2>

      <div className="dcase-figures">
        <div>
          <p className="dcase-value">{thousands(data.total_cases ?? 0)}</p>
          {/* เขียนว่า "ครั้งที่เข้ารับบริการ" ไม่ใช่ "คน"
              เพราะคนหนึ่งคนมาหลายครั้งได้ ต้นทางนับเป็นครั้ง ไม่ได้นับหัว */}
          <p className="dcase-caption">ครั้งที่เข้ารับบริการ</p>
        </div>
        <div>
          <p className="dcase-value">{monthly.length}</p>
          <p className="dcase-caption">
            เดือน · {monthly[0]?.label} – {monthly[monthly.length - 1]?.label}
          </p>
        </div>
        <div>
          <p className="dcase-value">{data.provinces?.length ?? 0}</p>
          <p className="dcase-caption">จังหวัด · {data.provinces?.join(" ")}</p>
        </div>
      </div>

      {series.length > 0 && (
        <>
          <p className="dcase-section">
            ผู้ป่วยรายเดือน เทียบกับปริมาณฝน
            <span>เดือนที่ฝนน้อยฝุ่นสะสม เดือนที่ฝนตกฝุ่นถูกชะลงไป</span>
          </p>

          {/* สองแกนเพราะคนละหน่วยกันโดยสิ้นเชิง
              ถ้าใช้แกนเดียว เส้นฝนที่มีค่าไม่ถึงห้าจะแบนติดพื้นจนมองไม่เห็น
              ขณะที่แท่งผู้ป่วยอยู่หลักหมื่น */}
          <div className="dcase-chart">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf1" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} width={62} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  width={46}
                  unit=" มม."
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#ccd6e0",
                    background: "#ffffff",
                    color: "#131a24",
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar yAxisId="left" dataKey="ผู้ป่วย" fill={CASE_COLOR} radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="ฝน"
                  stroke={RAIN_COLOR}
                  strokeWidth={2.4}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="dcase-splits">
        <div>
          <p className="dcase-section">แยกตามกลุ่มโรค</p>
          <ul className="dcase-list">
            {byGroup.map((item, index) => (
              <li key={item.group}>
                <span>{item.group.replace(/^(กลุ่มโรค|โรค)/, "")}</span>
                <span className="dcase-track">
                  <span
                    className="dcase-fill"
                    style={{
                      width: `${(item.cases / groupPeak) * 100}%`,
                      background: GROUP_COLORS[index % GROUP_COLORS.length],
                    }}
                  />
                </span>
                <span className="dcase-number">{thousands(item.cases)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="dcase-section">แยกตามจังหวัด</p>
          <ul className="dcase-list">
            {byProvince.map((item) => (
              <li key={item.province}>
                <span>{item.province}</span>
                <span className="dcase-track">
                  <span
                    className="dcase-fill"
                    style={{ width: `${(item.cases / provincePeak) * 100}%`, background: "#0d7e5a" }}
                  />
                </span>
                <span className="dcase-number">{thousands(item.cases)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ข้อจำกัดอยู่ในหน้า ไม่ใช่อยู่แต่ในเอกสาร
          เพราะกราฟที่วางผู้ป่วยคู่กับฝนชวนให้อ่านเป็นความสัมพันธ์เชิงสาเหตุทันที
          ทั้งที่ข้อมูลสองชุดนี้อยู่คนละปีกับค่าฝุ่นที่ระบบวัดได้ */}
      <p className="dcase-note">
        เป็นการเปรียบเทียบเชิงพรรณนา ไม่ใช่การพิสูจน์เชิงสาเหตุ ยังมีปัจจัยอื่นที่ไม่ได้ควบคุม
        เช่น ฤดูกาลของโรคติดเชื้อและจำนวนวันทำการของสถานพยาบาล ·
        ข้อมูลผู้ป่วยเป็นปี 2566 ส่วนค่าฝุ่นที่ระบบเก็บเริ่มปี 2569 สองชุดไม่ทับกันเลยสักวัน
        จึงคำนวณความสัมพันธ์ระหว่างค่าฝุ่นที่วัดได้กับจำนวนผู้ป่วยชุดนี้ไม่ได้
      </p>
    </section>
  );
}
