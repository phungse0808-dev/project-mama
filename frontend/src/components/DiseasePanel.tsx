import { useEffect, useMemo, useState } from "react";
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

// สีประจำกลุ่มโรค ใช้ชุดเดียวกันทั้งกราฟและตาราง เพื่อให้ตาโยงกันได้
const GROUP_COLORS: Record<string, string> = {
  กลุ่มโรคทางเดินหายใจ: "#e2574c",
  กลุ่มโรคตาอักเสบ: "#4c7fe2",
  กลุ่มโรคผิวหนังอักเสบ: "#00b050",
  กลุ่มโรคหัวใจและหลอดเลือด: "#e59500",
};

/**
 * ผลกระทบทางสุขภาพจากฝุ่น
 *
 * แสดงจำนวนผู้ป่วยรายเดือนของกลุ่มโรคที่กรมควบคุมโรคจัดว่าเกี่ยวข้องกับ PM2.5
 * วางคู่กับปริมาณฝนของเดือนเดียวกัน เพราะเดือนที่ฝนน้อยคือเดือนที่ฝุ่นสะสม
 *
 * เป็นการเปรียบเทียบเชิงพรรณนา ไม่ใช่การพิสูจน์เชิงสาเหตุ
 */
export function DiseasePanel() {
  const [data, setData] = useState<DiseaseSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.disease();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // แปลงเป็นรูปแบบที่กราฟใช้ได้ คือกระจายกลุ่มโรคออกมาเป็นคอลัมน์
  const points = useMemo(() => {
    if (!data?.monthly) return [];
    return data.monthly.map((month) => ({
      label: month.label,
      rainfall: month.rainfall_mm,
      ...month.groups,
    }));
  }, [data]);

  // เทียบหน้าแล้งกับหน้าฝน เพื่อดูว่ากลุ่มโรคไหนขึ้นลงตามฤดู
  const seasons = useMemo(() => {
    if (!data?.monthly || !data.groups || data.monthly.length < 6) return [];
    const dry = data.monthly.slice(0, 3);
    const wet = data.monthly.slice(-3);
    const mean = (rows: typeof dry, group: string) =>
      rows.reduce((sum, row) => sum + (row.groups[group] ?? 0), 0) / rows.length;

    return data.groups.map((group) => {
      const dryValue = mean(dry, group);
      const wetValue = mean(wet, group);
      return {
        group,
        dry: Math.round(dryValue),
        wet: Math.round(wetValue),
        change: wetValue === 0 ? 0 : Math.round(((dryValue - wetValue) / wetValue) * 100),
      };
    });
  }, [data]);

  if (loading) {
    return (
      <section className="panel">
        <h2 className="panel-title">ผลกระทบทางสุขภาพจากฝุ่น</h2>
        <p className="empty">กำลังโหลด...</p>
      </section>
    );
  }

  if (!data?.available) {
    return (
      <section className="panel">
        <h2 className="panel-title">
          ผลกระทบทางสุขภาพจากฝุ่น <span className="panel-hint">ยังไม่พร้อมใช้งาน</span>
        </h2>
        <p className="empty">
          {data?.reason ?? "ยังไม่มีข้อมูล"} — นำเข้าด้วยคำสั่ง{" "}
          <code>python -m scripts.collect_disease</code>
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        ผลกระทบทางสุขภาพจากฝุ่น
        <span className="panel-hint">
          {data.provinces?.length} จังหวัด · {data.period?.start.slice(0, 4)}
        </span>
      </h2>

      <div className="daily-summary">
        <span>
          ผู้ป่วยรวม <strong>{data.total_cases?.toLocaleString("th-TH")}</strong> ราย
        </span>
        <span>
          กลุ่มโรค <strong>{data.groups?.length}</strong> กลุ่ม
        </span>
        <span>
          ช่วงข้อมูล <strong>{data.monthly.length}</strong> เดือน
        </span>
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3d" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="cases" tick={{ fontSize: 12 }} width={64} />
            <YAxis
              yAxisId="rain"
              orientation="right"
              tick={{ fontSize: 12 }}
              unit=" mm"
              width={64}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, borderColor: "#303544", background: "#1a1d27", color: "#e8eaf0", fontSize: 13 }}
              labelFormatter={(label) => `เดือน ${label}`}
            />
            <Legend />
            {/* ฝนเป็นพื้นหลัง เพราะเป็นบริบท ไม่ใช่ตัวเลขหลักที่ต้องอ่าน */}
            <Bar
              yAxisId="rain"
              dataKey="rainfall"
              name="ฝนเฉลี่ย"
              fill="#dce6f5"
              radius={[3, 3, 0, 0]}
            />
            {data.groups?.map((group) => (
              <Line
                key={group}
                yAxisId="cases"
                type="monotone"
                dataKey={group}
                name={group.replace("กลุ่มโรค", "")}
                stroke={GROUP_COLORS[group] ?? "#888"}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {seasons.length > 0 && (
        <table className="disease-table">
          <thead>
            <tr>
              <th>กลุ่มโรค</th>
              <th>หน้าแล้ง</th>
              <th>หน้าฝน</th>
              <th>ต่าง</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((row) => (
              <tr key={row.group}>
                <td>
                  <span
                    className="landing-result-dot"
                    style={{ background: GROUP_COLORS[row.group] ?? "#888" }}
                  />
                  {row.group.replace("กลุ่มโรค", "")}
                </td>
                <td>{row.dry.toLocaleString("th-TH")}</td>
                <td>{row.wet.toLocaleString("th-TH")}</td>
                <td style={{ color: row.change > 0 ? "#f08080" : "#5fd18c" }}>
                  {row.change > 0 ? "+" : ""}
                  {row.change}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="weather-note">
        ข้อมูลจาก {data.source} ครอบคลุมเฉพาะ {data.provinces?.join(" ")} ไม่ใช่ทั้งประเทศ
        และเป็นจำนวนครั้งที่เข้ารับบริการ ไม่ใช่จำนวนคนที่ไม่ซ้ำกัน
        <br />
        ตัวเลขนี้ยังไม่ได้เทียบกับค่าฝุ่นโดยตรง เพราะเป็นข้อมูลคนละปีกับที่ระบบเก็บได้
        จึงใช้ปริมาณฝนแทนสภาพที่ฝุ่นสะสม การเพิ่มขึ้นของผู้ป่วยจึงมีปัจจัยอื่นปนอยู่ด้วย
        เช่นฤดูกาลของโรคติดเชื้อและจำนวนวันทำการของสถานพยาบาล
      </p>
    </section>
  );
}
