import { useEffect, useRef, useState } from "react";
import type { StationReading, StationSummary, Summary, WeatherNow } from "../api";

/** ระยะทางบนผิวโลกระหว่างสองพิกัด หน่วยกิโลเมตร */
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

type Props = { summary: Summary };
type CardProps = Props & {
  weatherNow: WeatherNow | null;
  provinces: string[];
  /** จังหวัดที่ใช้แสดงสภาพอากาศ มาจากช่องเลือกเดียวของหน้า ไม่มีช่องของตัวเอง */
  weatherProvince: string;
  /** ค่าว่างแปลว่าทั้งประเทศ */
  dustProvince: string;
  onDustProvinceChange: (province: string) => void;
  /** สถานีทั้งหมดที่ยังส่งข้อมูล ใช้ทำรายการในช่องเลือกสถานี */
  stations: StationReading[];
  /** รหัสสถานีที่เจาะดูอยู่ ค่าว่างแปลว่าดูรวมทั้งจังหวัด */
  dustStation: string;
  onDustStationChange: (code: string) => void;
  /** ค่าของสถานีที่เจาะดู เป็นค่าว่างระหว่างที่ยังโหลดไม่เสร็จ */
  stationSummary: StationSummary | null;
};

/** เอาเฉพาะชั่วโมงกับนาที จากค่าเวลาเช่น 2026-08-19T08:30 ซึ่งเป็นเวลาไทยอยู่แล้ว
 *
 * การ์ดเล็กบอกแค่เวลาตามแบบจำลอง ไม่บอกวันที่
 * เพราะทั้งค่าฝุ่นและอากาศเป็นข้อมูลของชั่วโมงล่าสุด วันเดียวกับวันนี้อยู่แล้ว
 */
function formatClock(value: string | null | undefined): string {
  if (!value) return "-";
  const time = value.split("T")[1];
  return time ? time.slice(0, 5) : value;
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
 * ตัวเลขใช้ฟอนต์ความกว้างคงที่ขนาด 15.5 พิกเซล บีบระยะห่างอีก 0.5
 * วัดของจริงบนหน้าเว็บได้ตัวละ 8.8 พิกเซล เลขสองหลักจึงกว้าง 17.6
 * เผื่อช่องไฟรวมอีก 3 พิกเซล กันไม่ให้ตัวเลขชิดขอบช่วงพอดีจนดูอึดอัด
 *
 * ตัวเลขนี้มาจากการวัดจริง ไม่ได้กะเอา ถ้าเปลี่ยนขนาดหรือชนิดฟอนต์
 * ของ .level-segment ใน App.css ต้องกลับมาวัดใหม่
 */
function labelWidth(count: number): number {
  return String(count).length * 8.8 + 3;
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
  stations,
  dustStation,
  onDustStationChange,
  stationSummary,
}: CardProps) {
  const worst = summary.worst_station;
  const now = weatherNow?.available ? weatherNow : null;

  // สถานีที่เลือกได้ เรียงตามชื่อไทยเพื่อให้ไล่หาในรายการยาวได้
  //
  // เลือกจังหวัดไว้ก็ได้เฉพาะสถานีในจังหวัดนั้น ดูทั้งประเทศก็ได้ทุกสถานี
  // โดยจัดกลุ่มตามจังหวัดให้ ไม่ใช่เรียงยาวรวดเดียว 174 บรรทัด
  //
  // เดิมตั้งใจซ่อนช่องนี้ตอนดูทั้งประเทศ เพราะคิดว่ารายการยาวเกินไป
  // แต่ผลคือคนเปิดหน้ามาครั้งแรกเจอ ทั้งประเทศ เป็นค่าตั้งต้น แล้วไม่เห็นช่องเลย
  // จึงอ่านว่าระบบเสีย ไม่ได้อ่านว่าต้องเลือกจังหวัดก่อน
  // ช่องที่หายไปเงียบ ๆ แยกไม่ออกจากของที่พัง การจัดกลุ่มแก้ปัญหาความยาวได้ตรงกว่า
  const stationChoices = [...(dustProvince
    ? stations.filter((item) => item.province === dustProvince)
    : stations)].sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));

  // จัดกลุ่มตามจังหวัดสำหรับตอนดูทั้งประเทศ เรียงชื่อจังหวัดตามลำดับไทย
  const stationsByProvince = dustProvince
    ? []
    : [...new Set(stationChoices.map((item) => item.province))]
        .sort((a, b) => a.localeCompare(b, "th"))
        .map((province) => ({
          province,
          items: stationChoices.filter((item) => item.province === province),
        }));

  // ยังซ่อนอยู่กรณีเดียว คือจังหวัดที่มีสถานีเดียวจริง ๆ
  // ตรงนั้นช่องเลือกมีตัวเลือกเดียว กดแล้วไม่เปลี่ยนอะไร จึงไม่ใช่ของที่หายไป
  const canPickStation = stationChoices.length > 1;

  // ใช้ค่าของสถานีต่อเมื่อโหลดมาแล้วจริง ระหว่างรอยังแสดงค่าของทั้งจังหวัดไปก่อน
  // ดีกว่าปล่อยการ์ดว่างไว้ เพราะค่าของจังหวัดก็เป็นค่าจริงที่ถูกต้องอยู่แล้ว
  const picked = canPickStation && dustStation ? stationSummary : null;
  const level = picked ? picked.level : summary.level;

  // ระยะจากสถานีฝุ่นถึงจุดกลางจังหวัดที่ใช้ดึงสภาพอากาศ
  //
  // การ์ดฝุ่นมาจากเครื่องวัดที่สถานี ส่วนการ์ดอากาศมาจากจุดกลางจังหวัด
  // สองจุดนี้อาจห่างกันหลายสิบกิโลเมตร ถ้าไม่บอก คนอ่านจะนึกว่าวัดที่เดียวกัน
  //
  // บอกเฉพาะตอนสองการ์ดเป็นจังหวัดเดียวกัน ดูทั้งประเทศไม่บอก
  // เพราะตอนนั้นการ์ดอากาศเป็นจังหวัดในโปรไฟล์ ไม่เกี่ยวกับค่าฝุ่นที่เป็นค่าเฉลี่ยทั้งประเทศ
  // เลือกสถานีเดียวบอกระยะของสถานีนั้น ดูทั้งจังหวัดบอกเป็นช่วงใกล้สุดถึงไกลสุด
  let distanceText = "";
  if (
    dustProvince &&
    now?.province === dustProvince &&
    now.latitude != null &&
    now.longitude != null
  ) {
    const from = (item: StationReading) =>
      distanceKm(item.latitude, item.longitude, now.latitude!, now.longitude!);
    const pickedStation = picked
      ? stations.find((item) => item.station_code === dustStation)
      : undefined;
    if (pickedStation) {
      distanceText = `ห่างจุดวัดอากาศ ${from(pickedStation).toFixed(1)} กม.`;
    } else {
      const inProvince = stations.filter((item) => item.province === dustProvince).map(from);
      if (inProvince.length > 0) {
        // ใกล้สุดกับไกลสุดปัดแล้วได้เลขเดียวกัน บอกเลขเดียว ไม่เขียน 9.3–9.3
        const near = Math.min(...inProvince).toFixed(1);
        const far = Math.max(...inProvince).toFixed(1);
        distanceText = `สถานีห่างจุดวัดอากาศ ${near === far ? near : `${near}–${far}`} กม.`;
      }
    }
  }

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
          <div className="card-group-pickers">
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

            {/* ช่องเลือกสถานี
                ตัวเลือกแรกเป็นภาพรวมของขอบเขตที่เลือกไว้ ซึ่งเป็นทั้งค่าตั้งต้น
                และเป็นทางกลับ ผู้ใช้จึงถอยออกจากการเจาะดูสถานีได้ในช่องเดียวกัน
                ไม่ต้องไปหาปุ่มยกเลิกที่อื่น */}
            {canPickStation && (
              <label className="card-group-picker">
                <span className="sr-only">เลือกสถานีตรวจวัดที่ต้องการเจาะดู</span>
                <select
                  value={dustStation}
                  onChange={(event) => onDustStationChange(event.target.value)}
                >
                  <option value="">
                    {dustProvince ? "ทุกสถานีในจังหวัด" : "ทุกสถานีทั่วประเทศ"}
                  </option>
                  {dustProvince
                    ? stationChoices.map((item) => (
                        <option key={item.station_code} value={item.station_code}>
                          {item.name_th}
                        </option>
                      ))
                    : stationsByProvince.map((group) => (
                        <optgroup key={group.province} label={group.province}>
                          {group.items.map((item) => (
                            <option key={item.station_code} value={item.station_code}>
                              {item.name_th}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                </select>
              </label>
            )}
          </div>
        </header>

        <div className="cards cards-dust">
          {/* การ์ดใบแรกเป็นคำตอบหลักของทั้งหน้า จึงกินเต็มความกว้างและระบายสีตามระดับ
              ผู้ใช้อ่านสถานการณ์ได้จากสีก่อนอ่านตัวเลข ซึ่งเร็วกว่าและเห็นได้จากระยะไกล
              ตอนนำเสนอด้วยโปรเจกเตอร์ */}
          <article
            className="card card-hero"
            style={
              level
                ? {
                    // พื้นโปร่งไล่สีจากสีระดับ แทนพื้นทึบ
                    //
                    // ทำให้เห็นเส้นกริดของพื้นหลังผ่านการ์ด เข้ากับส่วนอื่นของหน้า
                    // และตัวเลขเด่นขึ้นเพราะไม่มีพื้นสีจัดแย่งความสนใจ
                    //
                    // ยังเปลี่ยนสีตามระดับได้เหมือนเดิม เพราะผสมจากสีที่ส่งเข้ามา
                    // ไม่ได้กำหนดสีตายตัว พอค่าฝุ่นสูงขึ้นจะเป็นเหลืองส้มแดงเอง
                    background: `linear-gradient(160deg, ${level.color}26, ${level.color}08)`,
                    borderColor: `${level.color}59`,
                    boxShadow: `0 0 30px ${level.color}1f, inset 0 0 30px ${level.color}0d`,
                  }
                : undefined
            }
          >
            {/* อ่านขอบเขตจากคำตอบของเซิร์ฟเวอร์ ไม่ใช่จากค่าที่หน้าเว็บส่งไป
                เพราะระหว่างที่คำขอใหม่ยังไม่กลับมา ตัวเลขบนจอยังเป็นของขอบเขตเดิม
                ถ้าเปลี่ยนป้ายทันทีที่กดจะกลายเป็นป้ายไม่ตรงกับตัวเลข */}
            {/* เจาะดูสถานีเดียวไม่ใช่ค่าเฉลี่ยแล้ว จึงต้องเปลี่ยนคำกำกับด้วย
                ไม่ใช่แค่เปลี่ยนตัวเลข เพราะคำว่าเฉลี่ยกับค่าที่วัดได้จุดเดียว
                เป็นคนละอย่างกัน และบรรทัดล่างเปลี่ยนจากช่วงระหว่างสถานี
                เป็นช่วงตามเวลาของสถานีนั้น */}
            <p className="card-label">
              {picked
                ? `PM2.5 ${picked.name_th}`
                : `PM2.5 เฉลี่ย${summary.province ? summary.province : "ทั้งประเทศ"}`}
            </p>
            <p className="card-value">
              {picked ? picked.pm25 ?? "-" : summary.pm25_avg ?? "-"}
              <span className="card-unit">µg/m³</span>
            </p>
            {/* ตามแบบจำลอง บรรทัดใต้ตัวเลขบอกแค่ระดับ ดูหลายสถานีบอกจำนวนสถานีต่อท้าย
                รายละเอียดอื่นอยู่ในการ์ดเล็กข้างล่างแล้ว ไม่ต้องบอกซ้ำ */}
            <p className="card-note">
              {level ? level.label_th : "ไม่มีข้อมูลระดับ"}
              {picked ? "" : ` · ${summary.stations_reporting} สถานี`}
            </p>
            {distanceText && (
              <p className="dust-distance">
                <span aria-hidden="true">📍</span>
                {distanceText}
              </p>
            )}
          </article>

          {/* การ์ดเล็กสามใบบอกแค่หัวข้อกับตัวเลข ตามแบบจำลอง

              เจาะดูสถานีเดียว สองใบแรกเปลี่ยนเป็นค่าของสถานีนั้น
              เพราะจำนวนสถานีที่รายงานจะเป็น 1/1 ตลอด
              และค่าสูงสุดขณะนี้จะเป็นเลขตัวเดียวกับการ์ดใหญ่ */}
          {picked ? (
            <article className="card card-mini">
              <p className="card-label">ต่ำสุด–สูงสุด {picked.hours_window} ชม.</p>
              <p className="card-value card-value-sm">
                {picked.pm25_min ?? "-"}–{picked.pm25_max ?? "-"}
              </p>
            </article>
          ) : (
            <article className="card card-mini">
              <p className="card-label">สถานีที่รายงาน</p>
              <p className="card-value card-value-sm">
                {summary.stations_reporting} / {summary.stations_total}
              </p>
            </article>
          )}

          {picked ? (
            <article className="card card-mini">
              <p className="card-label">ดัชนี</p>
              <p className="card-value card-value-sm">{picked.aqi ?? "-"}</p>
            </article>
          ) : (
            <article className="card card-mini">
              <p className="card-label">สูงสุดขณะนี้</p>
              <p className="card-value card-value-sm">{worst ? worst.pm25 : "-"}</p>
            </article>
          )}

          {/* เวลาของสถานีที่เจาะดู ไม่ใช่เวลาล่าสุดของทั้งจังหวัด
              เพราะแต่ละสถานีส่งข้อมูลไม่พร้อมกัน */}
          <article className="card card-mini">
            <p className="card-label">ข้อมูล ณ เวลา</p>
            <p className="card-value card-value-sm">
              {formatClock(picked ? picked.measured_at : summary.measured_at)}
            </p>
          </article>
        </div>

      </section>

      {/* สภาพอากาศ ณ ขณะนี้ ของจังหวัดที่เลือก ดึงสดจาก Open-Meteo
          เพราะ NASA POWER เผยแพร่เฉพาะข้อมูลที่ผ่านมาแล้วและตามหลังหลายวัน */}
      <section className="card-group">
        <header className="card-group-head">
          <h2 className="card-group-title">สภาพอากาศ</h2>
          {/* ต้องบอกชื่อจังหวัดไว้ เพราะเมื่อเลือกทั้งประเทศ
              ค่าฝุ่นเป็นของทั้งประเทศ ส่วนอากาศเป็นของจังหวัดเดียว */}
          <span className="card-group-scope">{weatherProvince}</span>
        </header>

        {now ? (
          <div className="cards cards-weather">
            {/* บอกว่าเป็นค่าที่จุดกลางจังหวัด คู่กับป้ายระยะในการ์ดฝุ่น
                คนอ่านจะได้รู้ว่าสองการ์ดวัดกันคนละจุด */}
            <article className="card card-wide">
              <p className="card-label">อากาศตอนนี้ · จุดกลางจังหวัด</p>
              <p className="card-value">
                {now.temperature ?? "-"}
                <span className="card-unit">°C</span>
              </p>
              <p className="weather-now-condition">
                {now.condition}
                {now.wind_speed != null ? ` · ลม ${now.wind_speed} km/h` : ""}
                {/* ป้ายบอกว่าคำบอกสภาพอากาศมาจากเครื่องวัดฝน ไม่ใช่แบบจำลอง */}
                {now.condition_measured && <span className="weather-measured-pill">วัดได้จริง</span>}
              </p>
            </article>

            <article className="card card-mini">
              <p className="card-label">โอกาสฝนตกวันนี้</p>
              <p className="card-value card-value-sm">{now.rain_chance_pct ?? "-"}%</p>
            </article>

            <article className="card card-mini">
              <p className="card-label">อากาศ ณ เวลา</p>
              <p className="card-value card-value-sm">{formatClock(now.observed_at)}</p>
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

type LevelBarProps = Props & {
  /** สถานีทั้งประเทศ ใช้กางรายชื่อเมื่อกดป้ายสี */
  stations: StationReading[];
};

/** แถบแสดงจำนวนสถานีแยกตามระดับคุณภาพอากาศ */
export function LevelBar({ summary, stations }: LevelBarProps) {
  const [barRef, barWidth] = useWidth<HTMLDivElement>();
  // ระดับที่กางรายชื่ออยู่ ครั้งละระดับเดียว ค่าว่างแปลว่าปิดอยู่
  const [openLevel, setOpenLevel] = useState<string | null>(null);
  const total = Object.values(summary.level_counts).reduce((a, b) => a + b, 0);
  const worst = summary.worst_station;
  if (total === 0) return null;

  // รายชื่อของระดับที่เปิดอยู่ เรียงจากค่าสูงสุดลงมา
  //
  // ตัดสถานีที่ข้อมูลค้างออก ให้ตรงกับตัวเลขบนป้ายซึ่งนับเฉพาะสถานีที่ส่งข้อมูล
  // ถ้าไม่ตัด กดป้ายที่เขียนว่า 8 แล้วได้รายชื่อ 9 แห่ง จะดูเหมือนตัวเลขผิด
  //
  // ถ้ารอบดึงข้อมูลใหม่ทำให้ระดับที่เปิดอยู่เหลือศูนย์ รายการก็ปิดไปเอง
  // ไม่ค้างกล่องว่างไว้ให้งงว่าข้อมูลหายไปไหน
  const openCount = openLevel ? summary.level_counts[openLevel] ?? 0 : 0;
  const openInfo = summary.levels.find((level) => level.key === openLevel);
  const openStations =
    openLevel && openCount > 0
      ? stations
          .filter((item) => !item.is_stale && item.level.key === openLevel)
          .sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
      : [];

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
      {/* ป้ายสีเป็นปุ่ม กดแล้วกางรายชื่อสถานีของระดับนั้นใต้แถบ กดซ้ำเพื่อปิด
          ใช้ได้ทุกระดับ ไม่ใช่แค่สีเหลือง เพราะหน้าแล้งคำถามจะย้ายไปเป็นสีส้มกับแดง

          ไม่กางค้างไว้ตลอด เพราะช่วงฝุ่นหนักสถานีสีเหลืองขึ้นไปมีเป็นร้อย
          กล่องที่เปิดค้างจะดันแผงที่เหลือของหน้าลงไปไกล

          ระดับที่มีศูนย์สถานีกดไม่ได้ เพราะกดแล้วไม่มีอะไรให้ดู */}
      <ul className="legend">
        {summary.levels.map((level) => {
          const count = summary.level_counts[level.key] ?? 0;
          const isOpen = openLevel === level.key && count > 0;
          return (
            <li key={level.key}>
              <button
                type="button"
                className={isOpen ? "legend-btn on" : "legend-btn"}
                disabled={count === 0}
                aria-expanded={isOpen}
                onClick={() => setOpenLevel(isOpen ? null : level.key)}
                style={isOpen ? { borderColor: level.color } : undefined}
              >
                <span className="legend-dot" style={{ background: level.color }} />
                {level.label_th}
                <strong>{count}</strong>
              </button>
            </li>
          );
        })}
      </ul>

      {openInfo && openStations.length > 0 && (
        <div className="level-list">
          <p className="level-list-head">
            สถานีระดับ{openInfo.label_th} {openStations.length} แห่ง เรียงจากค่าสูงสุด
            <span>กดป้ายอีกครั้งเพื่อปิด</span>
          </p>
          <ul>
            {openStations.map((item) => (
              <li key={item.station_code}>
                <span className="level-list-name" title={item.name_th}>
                  {item.name_th}
                </span>
                <span className="level-list-province">{item.province}</span>
                <strong className="level-list-value">{item.pm25 ?? "-"}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

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
