import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api";
import type { HivStatistics } from "../api";

// สีประจำภาค ใช้ชุดที่แยกกันชัดโดยไม่ต้องพึ่งความเข้มอ่อน
// เพราะกราฟวงกลมอ่านด้วยการเทียบสีข้างเคียง ไม่ได้เรียงลำดับเหมือนกราฟแท่ง
const REGION_COLORS: Record<string, string> = {
  ภาคเหนือ: "#4c7fe2",
  ภาคตะวันออกเฉียงเหนือ: "#e59500",
  ภาคกลาง: "#7a5cc4",
  ภาคตะวันออก: "#00a86b",
  ภาคตะวันตก: "#b06fb0",
  ภาคใต้: "#e2574c",
};

/**
 * สัดส่วนผู้ติดเชื้อรายภาค
 *
 * ใช้กราฟวงกลมเพราะคำถามคือแต่ละภาคคิดเป็นสัดส่วนเท่าไรของทั้งหมด
 * ซึ่งเป็นการเทียบส่วนย่อยกับส่วนรวม กราฟวงกลมตอบคำถามแบบนี้ได้ตรงที่สุด
 *
 * ใช้จำนวนคนไม่ใช่อัตราต่อแสนคน เพราะอัตราเป็นค่าเฉลี่ยที่บวกกันไม่ได้
 * เอามาคิดเป็นสัดส่วนของวงกลมจะไม่มีความหมาย
 */
export function HivRegionChart() {
  const [data, setData] = useState<HivStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.hiv();
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

  const slices = useMemo(() => {
    const totals = new Map<string, { cases: number; provinces: string[] }>();
    for (const item of data?.provinces ?? []) {
      const region = item.region ?? "ไม่ทราบภาค";
      const bucket = totals.get(region) ?? { cases: 0, provinces: [] };
      bucket.cases += item.cases ?? 0;
      bucket.provinces.push(item.province);
      totals.set(region, bucket);
    }
    return [...totals.entries()]
      .map(([region, value]) => ({ region, ...value }))
      .sort((a, b) => b.cases - a.cases);
  }, [data]);

  const total = slices.reduce((sum, item) => sum + item.cases, 0);

  if (loading) {
    return (
      <section className="panel">
        <h2 className="panel-title">สัดส่วนผู้ติดเชื้อรายภาค</h2>
        <p className="empty">กำลังโหลด...</p>
      </section>
    );
  }

  if (slices.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel-title">
          สัดส่วนผู้ติดเชื้อรายภาค <span className="panel-hint">ยังไม่มีข้อมูล</span>
        </h2>
        <p className="empty">นำเข้าข้อมูลก่อนด้วย scripts/import_hiv.py</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        สัดส่วนผู้ติดเชื้อรายภาค
        <span className="panel-hint">
          รวม {total.toLocaleString("th-TH")} คน · สถิติปี {data?.year}
        </span>
      </h2>

      <div className="chart">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            {/* ปิดแอนิเมชันตอนวาดวง เพราะถ้าหน้าเว็บอยู่ในแท็บพื้นหลัง
                หรือหน้าต่างไม่ได้แสดงผล จังหวะการเรนเดอร์จะหยุด
                แล้ววงค้างอยู่ที่ขนาดศูนย์ กลายเป็นกราฟว่างเปล่า */}
            <Pie
              data={slices}
              dataKey="cases"
              nameKey="region"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={(props: { name?: string; percent?: number }) =>
                `${(props.name ?? "").replace("ภาค", "")} ${((props.percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
              isAnimationActive={false}
            >
              {slices.map((item) => (
                <Cell key={item.region} fill={REGION_COLORS[item.region] ?? "#888"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, borderColor: "#303544", background: "#1a1d27", color: "#e8eaf0", fontSize: 13 }}
              formatter={(value, name) => [`${Number(value).toLocaleString("th-TH")} คน`, String(name)]}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <table className="hiv-table">
        <thead>
          <tr>
            <th>ภาค</th>
            <th>ผู้ติดเชื้อ</th>
            <th>สัดส่วน</th>
            <th>จังหวัดที่มีข้อมูล</th>
          </tr>
        </thead>
        <tbody>
          {slices.map((item) => (
            <tr key={item.region}>
              <td>
                <span
                  className="landing-result-dot"
                  style={{ background: REGION_COLORS[item.region] ?? "#888" }}
                />
                {item.region}
              </td>
              <td>{item.cases.toLocaleString("th-TH")}</td>
              <td>{total ? ((item.cases / total) * 100).toFixed(1) : "0"}%</td>
              <td>{item.provinces.join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="weather-note">
        สัดส่วนนี้คิดจากจำนวนคน ไม่ใช่อัตราต่อแสนคน เพราะอัตราเป็นค่าเฉลี่ยที่บวกกันไม่ได้
        เอามาคิดเป็นสัดส่วนของวงกลมจะไม่มีความหมาย
        <br />
        กราฟนี้บอกว่าผู้ติดเชื้อ <strong>ในข้อมูลชุดนี้</strong> กระจายอยู่ภาคใดบ้าง
        ไม่ได้บอกว่าภาคไหนมีความชุกสูงกว่ากัน เพราะข้อมูลมีเพียง{" "}
        {data?.provinces.length} จังหวัดจาก 77 จังหวัด และแต่ละภาคมีจังหวัดในข้อมูลไม่เท่ากัน
        ภาคที่มีจังหวัดในข้อมูลมากกว่าย่อมได้ส่วนแบ่งมากกว่าโดยอัตโนมัติ
      </p>
    </section>
  );
}
