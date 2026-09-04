import { useEffect, useRef, useState } from "react";
import type { Summary, WeatherNow } from "../api";
import { formatThaiDateTime } from "../api";
import { WeatherIcon } from "./WeatherIcon";

type Props = { summary: Summary };
type CardProps = Props & {
  weatherNow: WeatherNow | null;
  provinces: string[];
  /** จังหวัดที่ใช้แสดงสภาพอากาศ มาจากช่องเลือกเดียวของหน้า ไม่มีช่องของตัวเอง */
  weatherProvince: string;
  /** ค่าว่างแปลว่าทั้งประเทศ */
  dustProvince: string;
  onDustProvinceChange: (province: string) => void;
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

/** ตำแหน่งของอุณหภูมิปัจจุบันบนแถบช่วง คิดเป็นร้อยละนับจากขอบซ้าย
 *
 * บีบให้อยู่ในช่วงศูนย์ถึงร้อยเสมอ เพราะค่าปัจจุบันหลุดนอกช่วงได้จริง
 * ค่าสูงสุดต่ำสุดเป็นค่าคาดการณ์ของทั้งวันซึ่งอัปเดตคนละรอบกับค่าปัจจุบัน
 * ถ้าไม่บีบไว้ จุดจะเลื่อนออกไปนอกแถบเมื่อสองค่านั้นไม่ตรงกัน
 *
 * ถ้าช่วงกว้างเป็นศูนย์ ซึ่งเกิดได้ตอนที่ต้นทางยังส่งค่ามาไม่ครบ
 * ให้วางไว้กลางแถบ แทนการหารด้วยศูนย์ซึ่งจะได้ค่าที่ใช้ไม่ได้
 */
function rangePosition(current: number, low: number, high: number): number {
  if (high <= low) return 50;
  return Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
}

/** ความกว้างจริงของกล่อง หน่วยพิกเซล ตามขนาดหน้าจอขณะนั้น
 *
 * ต้องวัดของจริง ไม่ใช้สัดส่วนร้อยละตัดสินว่าตัวเลขจะพอดีหรือไม่
 * เพราะร้อยละเท่ากันกินพื้นที่ไม่เท่ากันในแต่ละหน้าจอ
 * เจ็ดเปอร์เซ็นต์บนจอคอมกว้างพอใส่เลขสองหลักสบาย แต่บนมือถือไม่พอ
 *
 * ติดตามการเปลี่ยนขนาดด้วย เพราะผู้ใช้ย่อขยายหน้าต่างหรือหมุนจอได้
 * ถ้าวัดครั้งเดียวตอนเปิดหน้า ตัวเลขจะหายหรือโผล่ผิดจังหวะหลังจากนั้น
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();

    // ดักสองทางโดยตั้งใจ
    //
    // ResizeObserver แม่นกว่า เพราะจับได้แม้กล่องเปลี่ยนขนาดเองโดยที่หน้าต่างไม่ขยับ
    // แต่ไม่ได้ทำงานทุกที่ ในเบราว์เซอร์ฝังตัวบางตัวมีคลาสให้เรียกแต่ไม่เคยยิงเลย
    // ซึ่งเจอมาแล้วตอนทดสอบงานนี้
    //
    // เหตุการณ์ resize ของหน้าต่างหยาบกว่าแต่ทำงานทุกที่
    // และครอบคลุมกรณีที่เกิดจริงบ่อยที่สุดคือย่อขยายหน้าต่างกับหมุนจอมือถือ
    window.addEventListener("resize", measure);

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  return [ref, width] as const;
}

/** ความกว้างที่ตัวเลขต้องใช้ รวมช่องไฟข้างละนิด หน่วยพิกเซล
 *
 * ตัวเลขใช้ฟอนต์ความกว้างคงที่ขนาด 13 พิกเซล บีบระยะห่างอีก 0.5
 * วัดของจริงบนหน้าเว็บได้ตัวละ 7.3 พิกเซล เลขสองหลักจึงกว้าง 14.6
 * เผื่อช่องไฟรวมอีก 3 พิกเซล กันไม่ให้ตัวเลขชิดขอบช่วงพอดีจนดูอึดอัด
 *
 * ตัวเลขนี้มาจากการวัดจริง ไม่ได้กะเอา ถ้าเปลี่ยนขนาดหรือชนิดฟอนต์
 * ของ .level-segment ใน App.css ต้องกลับมาวัดใหม่
 */
function labelWidth(count: number): number {
  return String(count).length * 7.3 + 3;
}

/** การ์ดสรุปภาพรวมด้านบนสุดของแดชบอร์ด
 *
 * แบ่งเป็นสองกลุ่มเพราะการ์ดสองชุดนี้ตอบคนละเรื่องและมาคนละแหล่ง
 *     เรื่องของฝุ่น   จากสถานีตรวจวัดของกรมควบคุมมลพิษ
 *     สภาพอากาศ     จาก Open-Meteo
 *
 * เดิมวางเรียงต่อกันเจ็ดใบแล้วขึ้นบรรทัดที่สอง แยกไม่ออกว่าใบไหนเป็นเรื่องอะไร
 *
 * แต่ละกลุ่มมีช่องเลือกพื้นที่ของตัวเองที่หัวกลุ่ม และเลือกแยกกันได้
 * เพราะบางครั้งอยากดูฝุ่นทั้งประเทศพร้อมกับดูอากาศของจังหวัดตัวเอง
 * ต่างกันตรงที่กลุ่มฝุ่นมีตัวเลือกทั้งประเทศด้วย ส่วนอากาศต้องเจาะจงจังหวัดเสมอ
 * เพราะอุณหภูมิเฉลี่ยของทั้งประเทศไม่ได้บอกอะไรกับใคร
 */
export function SummaryCards({
  summary,
  weatherNow,
  provinces,
  weatherProvince,
  dustProvince,
  onDustProvinceChange,
}: CardProps) {
  const worst = summary.worst_station;
  const now = weatherNow?.available ? weatherNow : null;

  return (
    <section className="card-groups">
      <section className="card-group">
        <header className="card-group-head">
          <h2 className="card-group-title">เรื่องของฝุ่น</h2>
          {/* ช่องเลือกอยู่ที่หัวกลุ่มเหมือนกลุ่มสภาพอากาศ
              เพราะจังหวัดที่เลือกมีผลกับทุกใบในกลุ่มนี้ ไม่ใช่ใบใดใบหนึ่ง

              ตัวเลือกแรกเป็นทั้งประเทศ ไม่ใช่จังหวัดใดจังหวัดหนึ่ง
              เพราะภาพรวมทั้งประเทศเป็นคำตอบที่มีความหมายในตัวเอง
              ต่างจากสภาพอากาศที่ค่าเฉลี่ยทั้งประเทศไม่ได้บอกอะไร */}
          <label className="card-group-picker">
            <span className="sr-only">เลือกพื้นที่ที่ต้องการดูค่าฝุ่น</span>
            <select
              value={dustProvince}
              onChange={(event) => onDustProvinceChange(event.target.value)}
            >
              <option value="">ทั้งประเทศ</option>
              {provinces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="cards cards-dust">
          {/* การ์ดใบแรกเป็นคำตอบหลักของทั้งหน้า จึงกินเต็มความกว้างและระบายสีตามระดับ
              ผู้ใช้อ่านสถานการณ์ได้จากสีก่อนอ่านตัวเลข ซึ่งเร็วกว่าและเห็นได้จากระยะไกล
              ตอนนำเสนอด้วยโปรเจกเตอร์ */}
          <article
            className="card card-hero"
            style={
              summary.level
                ? {
                    // พื้นโปร่งไล่สีจากสีระดับ แทนพื้นทึบ
                    //
                    // ทำให้เห็นเส้นกริดของพื้นหลังผ่านการ์ด เข้ากับส่วนอื่นของหน้า
                    // และตัวเลขเด่นขึ้นเพราะไม่มีพื้นสีจัดแย่งความสนใจ
                    //
                    // ยังเปลี่ยนสีตามระดับได้เหมือนเดิม เพราะผสมจากสีที่ส่งเข้ามา
                    // ไม่ได้กำหนดสีตายตัว พอค่าฝุ่นสูงขึ้นจะเป็นเหลืองส้มแดงเอง
                    background: `linear-gradient(160deg, ${summary.level.color}26, ${summary.level.color}08)`,
                    borderColor: `${summary.level.color}59`,
                    boxShadow: `0 0 30px ${summary.level.color}1f, inset 0 0 30px ${summary.level.color}0d`,
                  }
                : undefined
            }
          >
            {/* อ่านขอบเขตจากคำตอบของเซิร์ฟเวอร์ ไม่ใช่จากค่าที่หน้าเว็บส่งไป
                เพราะระหว่างที่คำขอใหม่ยังไม่กลับมา ตัวเลขบนจอยังเป็นของขอบเขตเดิม
                ถ้าเปลี่ยนป้ายทันทีที่กดจะกลายเป็นป้ายไม่ตรงกับตัวเลข */}
            <p className="card-label">
              PM2.5 เฉลี่ย{summary.province ? summary.province : "ทั้งประเทศ"}
            </p>
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
            {/* ดูทั้งประเทศอยากรู้ว่าจังหวัดไหน ดูจังหวัดเดียวอยากรู้ว่าสถานีไหน
                เพราะรู้อยู่แล้วว่าเป็นจังหวัดที่เลือกไว้ การบอกซ้ำจึงไม่ได้ข้อมูลใหม่ */}
            <p className="card-note">
              {worst
                ? summary.province
                  ? worst.name_th
                  : `จ.${worst.province}`
                : "ไม่มีข้อมูล"}
            </p>
          </article>

          <article className="card">
            <p className="card-label">ข้อมูล ณ เวลา</p>
            <p className="card-value card-value-sm">
              {formatThaiDateTime(summary.measured_at)}
            </p>
            <p className="card-note">
          {/* จุดกะพริบบอกว่าระบบยังดึงข้อมูลอยู่ ไม่ใช่หน้าที่ค้างไว้เฉย ๆ */}
          <span className="live-dot" aria-hidden="true" />
          {describeAge(summary.minutes_behind)}
        </p>
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
          {/* กลุ่มนี้ไม่มีช่องเลือกของตัวเอง ใช้ช่องเดียวกับกลุ่มฝุ่นข้างบน
              แต่ต้องบอกชื่อจังหวัดไว้ เพราะเมื่อเลือกทั้งประเทศ
              ค่าฝุ่นเป็นของทั้งประเทศ ส่วนอากาศเป็นของจังหวัดเดียว
              ถ้าไม่บอกจะเข้าใจว่าอุณหภูมินี้เป็นค่าเฉลี่ยทั้งประเทศ */}
          <span className="card-group-scope">{weatherProvince}</span>
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

              {/* ช่วงอุณหภูมิของวัน แสดงเป็นแถบแทนบรรทัดตัวหนังสือ

                  ตัวเลขคู่เดิมบอกได้แค่ขอบเขต แต่ไม่ได้บอกว่าตอนนี้อยู่ตรงไหนของวัน
                  จุดบนแถบตอบคำถามนั้นได้ทันทีโดยไม่กินพื้นที่เพิ่ม
                  เช่น จุดค่อนไปทางซ้ายแปลว่ายังไม่ถึงจุดร้อนสุด อีกสักพักจะร้อนขึ้นอีก

                  ซ่อนทั้งแถบเมื่อขาดค่าใดค่าหนึ่ง เพราะแถบที่ไม่รู้ขอบเขตไม่ได้สื่ออะไร
                  และการเว้นว่างดีกว่าแสดงขีดกลางซึ่งทำให้เข้าใจว่าเป็นค่าจริง */}
              {now.temp_min != null && now.temp_max != null && (
                <div className="weather-now-range">
                  <div className="weather-range-end">
                    <p className="weather-range-label">ต่ำสุดวันนี้</p>
                    <p className="weather-range-value low">{now.temp_min}°</p>
                  </div>

                  <div className="weather-range-track">
                    <div className="weather-range-bar" aria-hidden="true">
                      {now.temperature != null && (
                        <span
                          className="weather-range-dot"
                          style={{
                            left: `${rangePosition(now.temperature, now.temp_min, now.temp_max)}%`,
                          }}
                        />
                      )}
                    </div>
                    <p className="weather-range-caption">
                      {now.temperature != null ? `ตอนนี้ ${now.temperature}° · ` : ""}
                      ต่างกัน {(now.temp_max - now.temp_min).toFixed(1)}°
                    </p>
                  </div>

                  <div className="weather-range-end right">
                    <p className="weather-range-label">สูงสุด</p>
                    <p className="weather-range-value high">{now.temp_max}°</p>
                  </div>
                </div>
              )}
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
  const [barRef, barWidth] = useWidth<HTMLDivElement>();
  const total = Object.values(summary.level_counts).reduce((a, b) => a + b, 0);
  const worst = summary.worst_station;
  if (total === 0) return null;

  return (
    <section className="panel">
      {/* เขียนกำกับว่านับเป็นรายสถานี เพราะแผงอันดับข้างกันนับเป็นรายจังหวัด
          สองแผงจึงให้ตัวเลขคนละชุดจากข้อมูลก้อนเดียวกัน
          ถ้าไม่บอกไว้จะดูเหมือนตัวเลขขัดกันเอง */}
      <h2 className="panel-title">
        สัดส่วนสถานีแยกตามระดับคุณภาพอากาศ
        <span className="panel-hint">นับรายสถานี จาก {total} สถานีที่ส่งข้อมูล</span>
      </h2>
      <div className="level-bar" ref={barRef}>
        {summary.levels.map((level) => {
          const count = summary.level_counts[level.key] ?? 0;
          if (count === 0) return null;

          // แสดงตัวเลขเมื่อช่วงนั้นกว้างพอจริง ๆ เท่านั้น
          //
          // ถ้าฝืนใส่ในช่วงที่แคบกว่าตัวเลข ตัวเลขจะล้นไปทับช่วงข้างเคียง
          // กลายเป็นอ่านผิดว่าเป็นของอีกระดับหนึ่ง ซึ่งแย่กว่าการไม่แสดง
          //
          // ช่วงที่แคบเกินไม่ได้หายไปไหน จำนวนอ่านได้จากคำอธิบายสีใต้แถบ
          // ซึ่งบอกครบทุกระดับอยู่แล้ว และชี้ค้างบนแถบก็ขึ้นบอกเช่นกัน
          const segmentWidth = (count / total) * barWidth;
          const fits = segmentWidth >= labelWidth(count);

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
              {fits ? count : ""}
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

      {/* สถานีที่ค่าสูงสุดของประเทศ
          ก่อนหน้านี้มองไม่เห็นเลยสักที่ในหน้าจอ เพราะแผงอันดับเฉลี่ยรายจังหวัด
          สถานีที่ค่าสูงจึงถูกสถานีอื่นในจังหวัดเดียวกันเฉลี่ยจนจมหายไป
          ทั้งที่เป็นตัวเลขที่ควรเห็นที่สุด เพราะเป็นจุดที่คนได้รับฝุ่นมากที่สุดจริง */}
      {worst && worst.pm25 != null && (
        <p className="level-worst">
          <span
            className="legend-dot"
            style={{ background: worst.level?.color ?? "var(--text-soft)" }}
          />
          สถานีที่ค่าสูงสุดตอนนี้ <strong>{worst.name_th}</strong>
          {/* ชื่อสถานีหลายแห่งมีชื่อจังหวัดอยู่ในตัวอยู่แล้ว
              เช่น ศูนย์ราชการจังหวัดระยอง ถ้าต่อท้ายอีกจะกลายเป็นพูดซ้ำ */}
          {worst.name_th.includes(worst.province) ? "" : ` จ.${worst.province}`}{" "}
          <strong>{worst.pm25}</strong> µg/m³
          {worst.level ? ` · ระดับ${worst.level.label_th}` : ""}
        </p>
      )}

      {/* สถานีที่ข้อมูลค้างถูกตัดออกจากทั้งแถบนี้ แผนที่ และอันดับ
          ถ้าไม่บอกไว้ ผลรวมจะไม่ตรงกับจำนวนสถานีทั้งหมดที่รายงานในแผงคุณภาพข้อมูล */}
      {summary.stations_stale > 0 && (
        <p className="level-note">
          ไม่รวม {summary.stations_stale} สถานีจากทั้งหมด {summary.stations_total} แห่ง
          ที่ข้อมูลค้างเกินเวลาที่ยอมรับได้
        </p>
      )}
    </section>
  );
}
