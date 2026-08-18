import type { Summary } from "../api";
import { formatThaiDateTime } from "../api";

type Props = { summary: Summary };

/** การ์ดสรุปภาพรวมด้านบนสุดของแดชบอร์ด */
export function SummaryCards({ summary }: Props) {
  const worst = summary.worst_station;

  return (
    <section className="cards">
      <article className="card">
        <p className="card-label">PM2.5 เฉลี่ยทั้งประเทศ</p>
        <p className="card-value">
          {summary.pm25_avg ?? "-"}
          <span className="card-unit">µg/m³</span>
        </p>
        <p className="card-note">
          ต่ำสุด {summary.pm25_min ?? "-"} · สูงสุด {summary.pm25_max ?? "-"}
        </p>
      </article>

      <article className="card">
        <p className="card-label">สถานีที่รายงานข้อมูล</p>
        <p className="card-value">
          {summary.stations_reporting}
          <span className="card-unit">/ {summary.stations_total} สถานี</span>
        </p>
        <p className="card-note">
          {summary.stations_stale > 0
            ? `มี ${summary.stations_stale} สถานีที่ข้อมูลค้างเกิน 6 ชั่วโมง`
            : "ทุกสถานีส่งข้อมูลเป็นปัจจุบัน"}
        </p>
      </article>

      <article className="card">
        <p className="card-label">จุดที่ค่าฝุ่นสูงที่สุดขณะนี้</p>
        <p className="card-value card-value-sm">{worst ? worst.pm25 : "-"}</p>
        <p className="card-note">
          {worst ? `${worst.name_th} จ.${worst.province}` : "ไม่มีข้อมูล"}
        </p>
      </article>

      <article className="card">
        <p className="card-label">ข้อมูล ณ เวลา</p>
        <p className="card-value card-value-sm">
          {formatThaiDateTime(summary.measured_at)}
        </p>
        <p className="card-note">อัปเดตอัตโนมัติทุกชั่วโมง</p>
      </article>
    </section>
  );
}

/** แถบแสดงจำนวนสถานีแยกตามระดับคุณภาพอากาศ */
export function LevelBar({ summary }: Props) {
  const total = Object.values(summary.level_counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <section className="panel">
      <h2 className="panel-title">สัดส่วนสถานีแยกตามระดับคุณภาพอากาศ</h2>
      <div className="level-bar">
        {summary.levels.map((level) => {
          const count = summary.level_counts[level.key] ?? 0;
          if (count === 0) return null;
          return (
            <div
              key={level.key}
              className="level-segment"
              style={{
                width: `${(count / total) * 100}%`,
                background: level.color,
              }}
              title={`${level.label_th} ${count} สถานี`}
            >
              {count / total > 0.08 ? count : ""}
            </div>
          );
        })}
      </div>
      <ul className="legend">
        {summary.levels.map((level) => (
          <li key={level.key}>
            <span className="legend-dot" style={{ background: level.color }} />
            {level.label_th}
            <strong>{summary.level_counts[level.key] ?? 0}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
