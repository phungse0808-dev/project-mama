import type { Summary, WeatherNow } from "../api";
import { formatThaiDateTime } from "../api";

type Props = { summary: Summary };
type CardProps = Props & { weatherNow: WeatherNow | null };

/** ตัดเอาเฉพาะเวลาจากค่าที่ต้นทางส่งมาเป็น 2026-08-19T08:30 ซึ่งเป็นเวลาไทยอยู่แล้ว */
function formatClock(value: string | undefined): string {
  if (!value) return "-";
  const [date, time] = value.split("T");
  if (!time) return value;
  const [, month, day] = date.split("-");
  return `${day}/${month} ${time} น.`;
}

/** บอกอายุของข้อมูลเป็นภาษาคน แทนที่จะให้ผู้ใช้เอาเวลาไปลบกันเอง
 *
 * ต้นทางเผยแพร่ค่าเป็นรายชั่วโมงและออกช้ากว่าเวลาที่ระบุเสมอ
 * ตัวเลขจึงเก่ากว่าปัจจุบันอยู่หลายสิบนาทีเป็นเรื่องปกติ ไม่ใช่ความผิดพลาด
 * แต่ต้องบอกให้เห็น ไม่ใช่ปล่อยให้เข้าใจว่าเป็นค่า ณ วินาทีนี้
 */
function describeAge(minutes: number | null): string {
  if (minutes == null) return "ไม่มีข้อมูลเวลา";
  if (minutes < 90) return `ข้อมูลเมื่อ ${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ข้อมูลเมื่อ ${hours} ชั่วโมงที่แล้ว`;
  return `ข้อมูลเมื่อ ${Math.floor(hours / 24)} วันที่แล้ว`;
}

/** การ์ดสรุปภาพรวมด้านบนสุดของแดชบอร์ด */
export function SummaryCards({ summary, weatherNow }: CardProps) {
  const worst = summary.worst_station;
  const now = weatherNow?.available ? weatherNow : null;

  return (
    <section className="cards">
      {/* การ์ดใบแรกเป็นคำตอบหลักของทั้งหน้า จึงให้กว้างเป็นสองเท่าและระบายสีตามระดับ
          ผู้ใช้อ่านสถานการณ์ได้จากสีก่อนอ่านตัวเลข ซึ่งเร็วกว่าและเห็นได้จากระยะไกล
          ตอนนำเสนอด้วยโปรเจกเตอร์ */}
      <article
        className="card card-hero"
        style={summary.level ? { background: summary.level.color } : undefined}
      >
        <p className="card-label">PM2.5 เฉลี่ยทั้งประเทศ</p>
        <p className="card-value">
          {summary.pm25_avg ?? "-"}
          <span className="card-unit">µg/m³</span>
        </p>
        <p className="card-note">
          {summary.level ? `คุณภาพอากาศ${summary.level.label_th} · ` : ""}
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
        <p className="card-note">{describeAge(summary.minutes_behind)}</p>
      </article>

      {/* สภาพอากาศ ณ ขณะนี้ ของจังหวัดที่ผู้ใช้ตั้งไว้
          ไม่ใช่ค่าเฉลี่ยทั้งประเทศแบบเดิม เพราะสภาพอากาศต่างกันมากในแต่ละภาค
          ค่าเฉลี่ยรวมทั้งประเทศจึงไม่ตรงกับที่ผู้ใช้เจอจริง

          ใช้คนละแหล่งกับข้อมูลอากาศย้อนหลังที่ระบบเก็บเอง
          เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลที่ผ่านมาแล้วและตามหลังหลายวัน
          บอกสภาพอากาศตอนนี้ไม่ได้ */}
      {now && (
        <>
          <article className="card">
            <p className="card-label">อากาศตอนนี้ · {now.province}</p>
            <p className="card-value">
              {now.temperature ?? "-"}
              <span className="card-unit">°C</span>
            </p>
            <p className="card-note">
              {now.condition} · สูงสุด {now.temp_max ?? "-"} · ต่ำสุด {now.temp_min ?? "-"} °C
            </p>
          </article>

          <article className="card">
            <p className="card-label">โอกาสฝนตกวันนี้</p>
            <p className="card-value">
              {now.rain_chance_pct ?? "-"}
              <span className="card-unit">%</span>
            </p>
            <p className="card-note">
              ความชื้น {now.humidity ?? "-"}% · ลม {now.wind_speed ?? "-"} km/h
            </p>
          </article>

          <article className="card">
            <p className="card-label">อากาศ ณ เวลา</p>
            <p className="card-value card-value-sm">
              {formatClock(now.observed_at)}
            </p>
            <p className="card-note">
              {now.minutes_behind != null
                ? `ข้อมูลเมื่อ ${now.minutes_behind} นาทีที่แล้ว · `
                : ""}
              จาก Open-Meteo
            </p>
          </article>
        </>
      )}

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
                backgroundColor: level.color,
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
