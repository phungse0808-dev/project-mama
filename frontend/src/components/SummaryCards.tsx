import type { Summary, WeatherNow } from "../api";
import { formatThaiDateTime } from "../api";
import { WeatherIcon } from "./WeatherIcon";

type Props = { summary: Summary };
type CardProps = Props & {
  weatherNow: WeatherNow | null;
  provinces: string[];
  weatherProvince: string;
  onWeatherProvinceChange: (province: string) => void;
};

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

/** การ์ดสรุปภาพรวมด้านบนสุดของแดชบอร์ด
 *
 * แบ่งเป็นสองกลุ่มเพราะการ์ดสองชุดนี้ตอบคนละเรื่องและมีขอบเขตต่างกัน
 *     เรื่องของฝุ่น   ภาพรวมทั้งประเทศ จากสถานีตรวจวัดของกรมควบคุมมลพิษ
 *     สภาพอากาศ     จังหวัดเดียวที่เลือก จาก Open-Meteo
 *
 * เดิมวางเรียงต่อกันเจ็ดใบแล้วขึ้นบรรทัดที่สอง แยกไม่ออกว่าใบไหนเป็นเรื่องอะไร
 * และเสี่ยงเข้าใจผิดว่าค่าฝุ่นเป็นของจังหวัดที่เลือกด้วย ทั้งที่เป็นค่าทั้งประเทศ
 */
export function SummaryCards({
  summary,
  weatherNow,
  provinces,
  weatherProvince,
  onWeatherProvinceChange,
}: CardProps) {
  const worst = summary.worst_station;
  const now = weatherNow?.available ? weatherNow : null;

  return (
    <section className="card-groups">
      <section className="card-group">
        <header className="card-group-head">
          <h2 className="card-group-title">เรื่องของฝุ่น</h2>
          {/* บอกขอบเขตไว้ตรงนี้ เพราะกลุ่มข้างๆ มีช่องเลือกจังหวัด
              ถ้าไม่บอกจะเข้าใจว่าค่าฝุ่นเปลี่ยนตามจังหวัดที่เลือกไปด้วย */}
          <span className="card-group-scope">ทั้งประเทศ</span>
        </header>

        <div className="cards cards-dust">
          {/* การ์ดใบแรกเป็นคำตอบหลักของทั้งหน้า จึงกินเต็มความกว้างและระบายสีตามระดับ
              ผู้ใช้อ่านสถานการณ์ได้จากสีก่อนอ่านตัวเลข ซึ่งเร็วกว่าและเห็นได้จากระยะไกล
              ตอนนำเสนอด้วยโปรเจกเตอร์ */}
          <article
            className="card card-hero"
            style={summary.level ? { backgroundColor: summary.level.color } : undefined}
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
            <p className="card-label">สถานีที่รายงาน</p>
            <p className="card-value card-value-md">
              {summary.stations_reporting}
              <span className="card-unit">/ {summary.stations_total}</span>
            </p>
            <p className="card-note">
              {summary.stations_stale > 0
                ? `ข้อมูลค้าง ${summary.stations_stale} สถานี`
                : "ทุกสถานีเป็นปัจจุบัน"}
            </p>
          </article>

          <article className="card">
            <p className="card-label">สูงสุดขณะนี้</p>
            <p className="card-value card-value-md">{worst ? worst.pm25 : "-"}</p>
            <p className="card-note">{worst ? `จ.${worst.province}` : "ไม่มีข้อมูล"}</p>
          </article>

          <article className="card">
            <p className="card-label">ข้อมูล ณ เวลา</p>
            <p className="card-value card-value-sm">
              {formatThaiDateTime(summary.measured_at)}
            </p>
            <p className="card-note">{describeAge(summary.minutes_behind)}</p>
          </article>
        </div>
      </section>

      {/* สภาพอากาศ ณ ขณะนี้ ของจังหวัดที่เลือก
          ใช้คนละแหล่งกับข้อมูลอากาศย้อนหลังที่ระบบเก็บเอง
          เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลที่ผ่านมาแล้วและตามหลังหลายวัน
          บอกสภาพอากาศตอนนี้ไม่ได้ */}
      <section className="card-group">
        <header className="card-group-head">
          <h2 className="card-group-title">สภาพอากาศ</h2>
          {/* ช่องเลือกอยู่ที่หัวกลุ่ม ไม่ใช่ในการ์ดใบใดใบหนึ่ง
              เพราะจังหวัดที่เลือกมีผลกับทุกใบในกลุ่มนี้ */}
          <label className="card-group-picker">
            <span className="sr-only">เลือกจังหวัดที่ต้องการดูสภาพอากาศ</span>
            <select
              value={weatherProvince}
              onChange={(event) => onWeatherProvinceChange(event.target.value)}
            >
              {provinces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </header>

        {now ? (
          <div className="cards cards-weather">
            {/* ใบนี้กินเต็มความกว้าง เพราะมีทั้งไอคอน อุณหภูมิ คำอธิบาย
                และช่วงต่ำสุดถึงสูงสุด ถ้าอยู่ครึ่งเดียวจะเบียดจนตัดบรรทัด */}
            <article className="card card-wide">
              <p className="card-label">อากาศตอนนี้</p>

              <div className="weather-now-main">
                <WeatherIcon code={now.weather_code} />
                <div>
                  <p className="card-value card-value-md">
                    {now.temperature ?? "-"}
                    <span className="card-unit">°C</span>
                  </p>
                  {/* คำอธิบายสภาพอากาศคือคำตอบว่าตอนนี้เป็นอย่างไร
                      จึงให้เด่นพอกับตัวเลข ไม่ใช่ตัวเล็กปนกับข้อมูลอื่นเหมือนเดิม */}
                  <p className="weather-now-condition">{now.condition}</p>
                </div>
              </div>

              {/* เขียนกำกับว่าตัวเลขคู่นี้คืออะไร ของเดิมเขียนติดกันเป็นช่วง
                  ผู้อ่านต้องเดาเองว่าเป็นช่วงของอะไร */}
              <div className="weather-now-range">
                <span>
                  ต่ำสุดวันนี้ <strong>{now.temp_min ?? "-"}°</strong>
                </span>
                <span>
                  สูงสุด <strong>{now.temp_max ?? "-"}°</strong>
                </span>
              </div>
            </article>

            <article className="card">
              <p className="card-label">โอกาสฝนตกวันนี้</p>
              <p className="card-value card-value-md">
                {now.rain_chance_pct ?? "-"}
                <span className="card-unit">%</span>
              </p>
              <p className="card-note">
                ชื้น {now.humidity ?? "-"}% · ลม {now.wind_speed ?? "-"} km/h
              </p>
            </article>

            <article className="card">
              <p className="card-label">อากาศ ณ เวลา</p>
              <p className="card-value card-value-sm">{formatClock(now.observed_at)}</p>
              <p className="card-note">
                {now.minutes_behind != null
                  ? `ข้อมูลเมื่อ ${now.minutes_behind} นาทีที่แล้ว · `
                  : ""}
                จาก Open-Meteo
              </p>
            </article>
          </div>
        ) : (
          <p className="empty">
            ยังไม่มีข้อมูลสภาพอากาศของ{weatherProvince} อาจเป็นเพราะเชื่อมต่อแหล่งข้อมูลไม่ได้
          </p>
        )}
      </section>
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
