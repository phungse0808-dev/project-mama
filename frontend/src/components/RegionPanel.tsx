import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type { RegionRank } from "../api";

const THAI_STANDARD = 37.5;

/**
 * ค่าฝุ่นเฉลี่ยรายภาค
 *
 * ใช้กราฟแท่ง ไม่ใช่กราฟวงกลม
 *
 * เพราะคำถามคือภาคไหนฝุ่นมากกว่ากัน ซึ่งเป็นการเทียบขนาด
 * กราฟวงกลมใช้กับสัดส่วนของส่วนย่อยต่อส่วนรวมเท่านั้น
 * ค่าเฉลี่ยของแต่ละภาคบวกกันไม่ได้ ถ้าเอามาแบ่งวงกลมจะไม่มีความหมาย
 * เช่นภาคกลาง 14.8 กับภาคใต้ 7.9 รวมกันไม่ได้เป็นค่าฝุ่นของทั้งประเทศ
 */
export function RegionPanel() {
  const [rows, setRows] = useState<RegionRank[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.regionRanking();
        if (!cancelled) setRows(result);
      } catch {
        if (!cancelled) setRows(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const points = useMemo(
    () => (rows ?? []).map((row) => ({ ...row, label: row.region.replace("ภาค", "") })),
    [rows],
  );

  // สถานีน้อยแปลว่าค่าเฉลี่ยอ่อนไหวต่อสถานีเดียวมาก ต้องเตือนผู้อ่าน
  const thin = useMemo(() => (rows ?? []).filter((row) => row.station_count < 10), [rows]);

  if (loading) {
    return (
      <section className="panel">
        <h2 className="panel-title">ค่าฝุ่นเฉลี่ยรายภาค</h2>
        <p className="empty">กำลังโหลด...</p>
      </section>
    );
  }

  if (!rows?.length) {
    return (
      <section className="panel">
        <h2 className="panel-title">
          ค่าฝุ่นเฉลี่ยรายภาค <span className="panel-hint">ยังไม่มีข้อมูล</span>
        </h2>
        <p className="empty">ยังไม่มีสถานีที่รายงานค่าฝุ่นในขณะนี้</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        ค่าฝุ่นเฉลี่ยรายภาค
        <span className="panel-hint">
          {rows.length} ภาค · {rows.reduce((sum, r) => sum + r.station_count, 0)} สถานี
        </span>
      </h2>

      <div className="chart">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={points} margin={{ top: 20, right: 16, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit=" µg/m³" width={82} />
            <Tooltip
              contentStyle={{ borderRadius: 8, borderColor: "#d8dde5", fontSize: 13 }}
              formatter={(value) => [`${value} µg/m³`, "ค่าเฉลี่ย"]}
              labelFormatter={(label) => `ภาค${label}`}
            />
            {/* เส้นมาตรฐานไทยไว้เทียบ ให้เห็นทันทีว่ายังห่างจากเกณฑ์แค่ไหน */}
            <ReferenceLine
              y={THAI_STANDARD}
              stroke="#e2574c"
              strokeDasharray="5 4"
              label={{
                value: `มาตรฐานไทย ${THAI_STANDARD}`,
                position: "insideTopRight",
                fontSize: 11,
                fill: "#b02020",
              }}
            />
            <Bar dataKey="pm25_avg" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList dataKey="pm25_avg" position="top" fontSize={12} />
              {points.map((point) => (
                <Cell key={point.region} fill={point.level.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="hiv-table">
        <thead>
          <tr>
            <th>ภาค</th>
            <th>เฉลี่ย</th>
            <th>ต่ำสุด–สูงสุด</th>
            <th>สถานี</th>
            <th>ระดับ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.region}>
              <td>
                <span
                  className="landing-result-dot"
                  style={{ background: row.level.color }}
                />
                {row.region}
              </td>
              <td>{row.pm25_avg}</td>
              <td>
                {row.pm25_min}–{row.pm25_max}
              </td>
              <td>
                {row.station_count} จาก {row.province_count} จังหวัด
              </td>
              <td>{row.level.label_th}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="weather-note">
        ใช้กราฟแท่งไม่ใช่กราฟวงกลม เพราะคำถามคือภาคไหนฝุ่นมากกว่ากัน ซึ่งเป็นการเทียบขนาด
        ส่วนกราฟวงกลมใช้กับสัดส่วนของส่วนย่อยต่อส่วนรวม ค่าเฉลี่ยของแต่ละภาคบวกกันไม่ได้
        จึงแบ่งเป็นวงกลมไม่ได้
        {thin.length > 0 && (
          <>
            <br />
            {thin.map((row) => row.region).join(" และ ")} มีสถานีน้อยกว่า 10 แห่ง
            ค่าเฉลี่ยจึงอ่อนไหวต่อสถานีเดียวมาก อ่านคู่กับจำนวนสถานีในตารางเสมอ
          </>
        )}
      </p>
    </section>
  );
}
