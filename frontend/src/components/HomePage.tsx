import { useEffect, useState } from "react";
import { api } from "../api";
import type {
  HealthAdvice,
  StationReading,
  StationSummary,
  Summary,
  WeatherNow,
  Wind,
} from "../api";
import { DiseaseRisk } from "./DiseaseRisk";
import { WeatherIcon } from "./WeatherIcon";
import { ProtectIcon } from "./ProtectIcon";
import { levelInk } from "../levelInk";

type Props = {
  summary: Summary | null;
  onOpenAir: () => void;
  /** จังหวัดที่ใช้แสดงสภาพอากาศ ว่างได้ จะตกไปใช้ค่าตั้งต้น */
  province: string | null;
  provinces: string[];
  /** พื้นที่ที่เลือกดู ค่าว่างแปลว่าทั้งประเทศ */
  area: string;
  /** สถานีทั้งหมด ใช้สร้างรายการในช่องเลือก */
  stations: StationReading[];
  /** รหัสสถานีที่เจาะดู ค่าว่างแปลว่าดูทั้งขอบเขตที่เลือก */
  station: string;
  /** ค่าของสถานีที่เจาะดู เป็น null ระหว่างรอโหลดหรือเมื่อไม่ได้เจาะสถานี */
  stationSummary: StationSummary | null;
  /** เปลี่ยนขอบเขตที่ดู ส่งทั้งจังหวัดและสถานีพร้อมกันเพราะช่องเลือกมีช่องเดียว */
  onScopeChange: (province: string, station: string) => void;
  /** กลุ่มเสี่ยงที่ผู้ใช้เลือกไว้ตอนตั้งโปรไฟล์ ว่างได้ถ้ายังไม่เคยเลือก */
  riskGroup: string | null;
};

/** จังหวัดที่ใช้เมื่อผู้ใช้ยังไม่ได้ตั้ง
 *
 * ต้องมีค่าตั้งต้นเพราะสภาพอากาศต้องเจาะจงจังหวัดเสมอ
 * ต่างจากค่าฝุ่นที่ค่าเฉลี่ยทั้งประเทศยังมีความหมายในตัวเอง
 * ส่วนอุณหภูมิเฉลี่ยของทั้งประเทศไม่ได้บอกอะไรกับใคร
 */
const DEFAULT_PROVINCE = "กรุงเทพฯ";

/**
 * หน้าหลัก
 *
 * ทำหน้าที่เป็นทางเข้า แทนที่จะพาเข้าหน้าข้อมูลทันทีหลังเข้าระบบ
 *
 * ข้อดีคือทางเข้ามีที่ให้บอกว่าข้างในมีอะไรและตอนนี้ค่าเป็นเท่าไร
 * ผู้ใช้จึงเห็นภาพรวมก่อนกดเข้าไปดูรายละเอียด
 */
export function HomePage({
  summary,
  onOpenAir,
  province,
  provinces,
  area,
  stations,
  station,
  stationSummary,
  onScopeChange,
  riskGroup,
}: Props) {
  const [weather, setWeather] = useState<WeatherNow | null>(null);
  const [wind, setWind] = useState<Wind | null>(null);
  const [advice, setAdvice] = useState<HealthAdvice | null>(null);

  // จังหวัดที่ใช้ดึงอากาศ เรียงลำดับความสำคัญจากที่เจาะจงที่สุดลงมา
  //
  // เลือกไว้ > จังหวัดในโปรไฟล์ > ค่าตั้งต้น
  // เพราะอากาศต้องเจาะจงจังหวัดเสมอ ไม่มีตัวเลือกทั้งประเทศให้ตกไปใช้
  const target = area || province || DEFAULT_PROVINCE;

  // คำแนะนำรายกลุ่มเสี่ยงของพื้นที่ที่เลือก
  //
  // ใช้ค่าฝุ่นของขอบเขตเดียวกับที่การ์ดแสดงอยู่ คำแนะนำกับตัวเลขจึงตรงกันเสมอ
  // ถ้าดึงไม่สำเร็จก็แค่ไม่ขึ้นรายกลุ่ม ส่วนข้อปฏิบัติสามข้อยังอยู่ตามเดิม
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.healthAdvice(area || null, station || null);
        if (!cancelled) setAdvice(result);
      } catch {
        if (!cancelled) setAdvice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [area, station]);

  // ดึงสภาพอากาศของจังหวัดที่เลือก
  //
  // ต้นทางอัปเดตทุก 15 นาที จึงดึงซ้ำทุก 10 นาทีก็เพียงพอ
  // ใช้จังหวะเดียวกับที่หน้าฝุ่นใช้ จะได้ไม่มีสองจังหวะให้สับสน
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.weatherNow(target);
        if (!cancelled) setWeather(result);
      } catch {
        if (!cancelled) setWeather(null);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [target]);

  // ดึงลมของจังหวัดเดียวกันกับอากาศ ใช้จังหวะเดียวกันด้วย
  //
  // แยก effect ออกจากอากาศเพราะเป็นคนละเส้นทาง ถ้าเส้นใดเส้นหนึ่งล่ม
  // อีกเส้นต้องยังแสดงได้ตามปกติ ไม่ใช่หายไปทั้งคู่
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = await api.wind(target, 24);
        if (!cancelled) setWind(result);
      } catch {
        if (!cancelled) setWind(null);
      }
    };

    void load();
    const timer = setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [target]);

  const now = weather?.available ? weather : null;
  const air = wind?.available ? wind : null;

  // ค่าของสถานีที่เจาะดู ใช้ต่อเมื่อโหลดมาแล้วจริง ระหว่างรอยังแสดงค่าของขอบเขตเดิมไปก่อน
  // ดีกว่าปล่อยการ์ดว่างไว้ เพราะค่าของจังหวัดก็เป็นค่าจริงที่ถูกต้องอยู่แล้ว
  const picked = station ? stationSummary : null;

  // ระดับที่ใช้ทั้งระบายสีการ์ดและเลือกชุดคำแนะนำ มาจากขอบเขตที่แสดงอยู่เสมอ
  const level = picked ? picked.level : summary?.level ?? null;
  const protection = picked ? picked.protection : summary?.protection ?? [];

  // สถานีที่เลือกได้ เรียงตามชื่อไทยเพื่อให้ไล่หาในรายการยาวได้
  //
  // ชุดเดียวกับหน้าวัดคุณภาพอากาศ เลือกจังหวัดไว้ก็ได้เฉพาะสถานีในจังหวัดนั้น
  // ดูทั้งประเทศก็ได้ทุกสถานี โดยจัดกลุ่มตามจังหวัดให้ ไม่ใช่เรียงยาวรวดเดียว
  const stationChoices = [
    ...(area ? stations.filter((item) => item.province === area) : stations),
  ].sort((a, b) => a.name_th.localeCompare(b.name_th, "th"));

  const stationsByProvince = area
    ? []
    : [...new Set(stationChoices.map((item) => item.province))]
        .sort((a, b) => a.localeCompare(b, "th"))
        .map((item) => ({
          province: item,
          items: stationChoices.filter((each) => each.province === item),
        }));

  // ซ่อนช่องสถานีกรณีเดียว คือจังหวัดที่มีสถานีเดียวจริง ๆ
  // ตรงนั้นช่องเลือกมีตัวเลือกเดียว กดแล้วไม่เปลี่ยนอะไร จึงไม่ใช่ของที่หายไป
  const canPickStation = stationChoices.length > 1;

  return (
    <div className="home-entry">
      {/* วางช่องเลือกไว้นอกการ์ด ไม่ใช่ในหัวการ์ดเหมือนหน้าฝุ่น
          เพราะการ์ดใบนี้เป็นปุ่มทั้งใบ ถ้าเอาช่องเลือกไปไว้ข้างใน
          การกดเลือกจะไปโดนปุ่มดักก่อนจนเปลี่ยนหน้าแทนที่จะเปิดรายการ
          และปุ่มซ้อนในปุ่มยังเป็นโครงสร้างที่ไม่ถูกต้องด้วย */}
      <div className="home-head">
        {/* สองช่องเรียงกัน ชุดเดียวกับหัวกลุ่มในหน้าวัดคุณภาพอากาศ
            ทั้งสองหน้าใช้ค่าจังหวัดกับสถานีตัวเดียวกัน ถ้าทำคนละแบบ
            ผู้ใช้ต้องเรียนรู้สองครั้งสำหรับของอย่างเดียวกัน

            ตัวเลือกแรกของช่องสถานีเป็นภาพรวมของขอบเขตที่เลือกไว้
            ซึ่งเป็นทั้งค่าตั้งต้นและเป็นทางกลับ ผู้ใช้จึงถอยออกจากการเจาะดูสถานี
            ได้ในช่องเดียวกัน ไม่ต้องไปหาปุ่มยกเลิกที่อื่น */}
        <div className="card-group-pickers">
          <label className="card-group-picker">
            <span className="sr-only">เลือกพื้นที่ที่ต้องการดู</span>
            <select value={area} onChange={(event) => onScopeChange(event.target.value, "")}>
              <option value="">ทั้งประเทศ</option>
              {provinces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {canPickStation && (
            <label className="card-group-picker">
              <span className="sr-only">เลือกสถานีตรวจวัดที่ต้องการเจาะดู</span>
              <select
                value={station}
                onChange={(event) => {
                  const code = event.target.value;
                  // ตั้งจังหวัดตามสถานีด้วยเมื่อเลือกจากรายการรวมทั้งประเทศ
                  // เพราะอากาศกับลมยังอ่านเป็นรายจังหวัด ถ้าไม่ตั้งจะเป็นคนละที่กับฝุ่น
                  const found = stations.find((item) => item.station_code === code);
                  onScopeChange(code ? found?.province ?? area : area, code);
                }}
              >
                <option value="">{area ? "ทุกสถานีในจังหวัด" : "ทุกสถานีทั่วประเทศ"}</option>
                {area
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
      </div>

      <button className="panel home-card" onClick={onOpenAir}>
        <h2 className="home-card-title">วัดคุณภาพอากาศ</h2>
        <p className="home-card-detail">
          ค่าฝุ่นล่าสุดทุกสถานี แผนที่ อันดับจังหวัด กราฟย้อนหลัง
          คำแนะนำที่ตรงกับตัวคุณ และผลกระทบต่อสุขภาพ
        </p>

        {/* สามกลุ่มเรียงเป็นสามคอลัมน์ ไม่ใช่ซ้อนกันลงมา
            เดิมแต่ละกลุ่มกินเต็มความกว้าง ได้ช่องกว้างหกร้อยพิกเซล
            สำหรับตัวเลขสี่ตัว พื้นที่ว่างจึงมากกว่าตัวเนื้อหา และการ์ดสูงเกือบห้าร้อย

            ยังต้องแบ่งกลุ่มอยู่ เพราะขอบเขตของตัวเลขต่างกัน
            ค่าฝุ่นเป็นภาพรวมทั้งประเทศ ส่วนอากาศกับลมเป็นของจังหวัดเดียว
            ถ้าเรียงหกช่องรวดจะเข้าใจผิดว่าอุณหภูมิเป็นค่าเฉลี่ยทั้งประเทศด้วย */}
        <div className="home-cols">
          {/* อ่านขอบเขตจากคำตอบของเซิร์ฟเวอร์ ไม่ใช่จากค่าที่เลือกไว้
              เพราะระหว่างที่คำขอใหม่ยังไม่กลับมา ตัวเลขบนจอยังเป็นของขอบเขตเดิม */}
          {/* ระบายสีใบฝุ่นตามระดับที่วัดได้ เหมือนการ์ดใหญ่ในหน้าวัดคุณภาพอากาศ
              ผสมจากสีที่เซิร์ฟเวอร์ส่งมา ไม่ได้กำหนดสีตายตัว
              ค่าฝุ่นสูงขึ้นใบนี้จึงเปลี่ยนเป็นเหลืองส้มแดงเองตามระดับ */}
          <div
            className="home-col dust"
            style={
              level
                ? {
                    background: `linear-gradient(160deg, ${level.color}26, ${level.color}08)`,
                    borderColor: `${level.color}59`,
                  }
                : undefined
            }
          >
            {/* ป้ายมุมขวายังเป็นจังหวัดแม้เจาะดูสถานีเดียว ไม่ใช่ชื่อสถานี
                เพราะชื่อสถานียาวได้ถึงเจ็ดสิบห้าตัวอักษร เช่น
                สถานีสวนเฉลิมพระเกียรติพระบาทสมเด็จพระเจ้าอยู่หัว เฉลิมพระชนมพรรษา 80 พรรษา
                ซึ่งกินสามบรรทัดในช่องกว้างไม่ถึงครึ่ง และยังต้องเรียงให้ตรงกับ
                ป้ายของอีกสองใบที่เป็นจังหวัดเหมือนกัน ชื่อสถานีจึงไปอยู่บรรทัดคำอธิบายแทน */}
            <p className="home-col-head">
              เรื่องของฝุ่น<span>{picked?.province ?? summary?.province ?? "ทั้งประเทศ"}</span>
            </p>

            <p className="home-col-value">
              {picked ? picked.pm25 ?? "—" : summary?.pm25_avg ?? "—"}
              <span className="home-col-unit">µg/m³</span>
            </p>

            {/* เจาะดูสถานีเดียวไม่ใช่ค่าเฉลี่ยแล้ว จึงต้องเปลี่ยนคำกำกับด้วย
                ไม่ใช่แค่เปลี่ยนตัวเลข เพราะค่าเฉลี่ยกับค่าที่วัดได้จุดเดียว
                เป็นคนละอย่างกัน

                เขียนระดับไว้หน้าชื่อสถานี เพราะบรรทัดนี้ตัดท้ายเมื่อยาวเกิน
                ระดับเป็นข้อมูลที่ต้องเห็นเสมอ ส่วนชื่อสถานีดูเต็ม ๆ ได้จากช่องเลือกข้างบน */}
            {picked ? (
              <p className="home-col-note home-col-one-line" title={picked.name_th}>
                {`ระดับ${picked.level.label_th} · ${picked.name_th}`}
              </p>
            ) : (
              <p className="home-col-note">
                {summary?.province ? "เฉลี่ยในจังหวัด" : "เฉลี่ยทั้งประเทศ"}
                {summary?.level ? ` · ระดับ${summary.level.label_th}` : ""}
              </p>
            )}

            {/* บรรทัดล่างเปลี่ยนเรื่องไปเลยเมื่อเจาะดูสถานีเดียว
                ของเดิมคือค่าสูงสุดระหว่างสถานี ซึ่งพอเหลือสถานีเดียวจะเป็นเลขตัวเดียว
                กับที่อยู่ข้างบนเป๊ะ ๆ จึงเปลี่ยนเป็นช่วงตามเวลาของสถานีนั้นแทน

                บอกจำนวนชั่วโมงที่มีค่าจริง ไม่ใช่ช่วงที่ขอไป
                เพราะหลายสถานีส่งไม่ครบทุกชั่วโมง บางแห่งใน 24 ชั่วโมงมีแค่สิบ */}
            {picked ? (
              <p className="home-col-sub">
                <strong>
                  {picked.pm25_min ?? "—"}–{picked.pm25_max ?? "—"}
                </strong>
                {picked.hours_with_data > 0
                  ? `ต่ำสุด–สูงสุดใน ${picked.hours_with_data} ชม.`
                  : "ยังไม่มีค่าย้อนหลัง"}
              </p>
            ) : (
              <p className="home-col-sub">
                <strong>{summary?.pm25_max ?? "—"}</strong>
                สูงสุด{summary?.worst_station ? ` · ${summary.worst_station.province}` : ""}
              </p>
            )}
          </div>

          {/* ซ่อนทั้งคอลัมน์เมื่อดึงอากาศไม่ได้ ไม่ใช่แสดงขีดกลาง
              เพราะช่องว่างเรียงกันดูเหมือนระบบพัง ส่วนการหายไปเงียบ ๆ
              ยังเหลือคอลัมน์ฝุ่นที่ใช้งานได้ตามปกติ */}
          {now && (
            <div className="home-col weather">
              <p className="home-col-head">
                สภาพอากาศ<span>{now.province ?? target}</span>
              </p>

              <div className="home-col-main">
                <WeatherIcon code={now.weather_code} size={30} />
                <div>
                  <p className="home-col-value">
                    {now.temperature ?? "—"}
                    <span className="home-col-unit">°C</span>
                  </p>
                  <p className="home-col-note">{now.condition}</p>
                </div>
              </div>

              <p className="home-col-sub">
                <strong>{now.rain_chance_pct ?? "—"}%</strong>
                โอกาสฝนตกวันนี้
              </p>
            </div>
          )}

          {air && (
            <div className="home-col wind">
              <p className="home-col-head">
                ลม<span>{air.province ?? target}</span>
              </p>

              <div className="home-col-main">
                {/* เข็มทิศชี้ทิศที่ลมพัดไป ส่วนองศาที่ต้นทางส่งมาคือทิศที่ลมพัดมาจาก
                    สองอย่างนี้ตรงข้ามกันเสมอ จึงหมุนเพิ่มอีกร้อยแปดสิบองศา */}
                <svg className="home-wind-dial" viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="17" />
                  {air.wind_direction != null && (
                    <g transform={`rotate(${air.wind_direction + 180} 20 20)`}>
                      <line x1="20" y1="29" x2="20" y2="13" />
                      <path d="M20 9 L24 17 L20 15 L16 17 Z" />
                    </g>
                  )}
                </svg>
                <div>
                  <p className="home-col-value">
                    {air.wind_speed ?? "—"}
                    <span className="home-col-unit">km/h</span>
                  </p>
                  <p className="home-col-note">
                    {air.level?.label_th ?? "ไม่ทราบระดับ"}
                    {air.wind_direction_th ? ` · จากทิศ${air.wind_direction_th}` : ""}
                  </p>
                </div>
              </div>

              {/* ไม่มีชั่วโมงลมสงบเป็นข่าวดี ไม่ใช่ตัวเลขที่ต้องเน้น
                  เดิมแสดงเลขศูนย์ตัวใหญ่เท่าค่าอื่น ซึ่งอ่านเหมือนมีอะไรผิดปกติ
                  จึงเปลี่ยนเป็นประโยคบอกเล่าเมื่อไม่มี และเน้นตัวเลขเฉพาะตอนที่มีจริง */}
              <p className="home-col-sub">
                {air.calm_hours ? (
                  <>
                    <strong>{air.calm_hours} ชม.</strong>
                    ลมสงบใน 24 ชม. · ช่วงที่ฝุ่นสะสม
                  </>
                ) : (
                  "อีก 24 ชม. ไม่มีช่วงลมสงบ อากาศถ่ายเทตลอด"
                )}
              </p>
            </div>
          )}
        </div>

        {/* วิธีป้องกันตัวชุดเดียวกับหน้าวัดคุณภาพอากาศ
            ใช้ค่าที่มากับ summary อยู่แล้ว ไม่ได้ขอเพิ่ม
            คำแนะนำกับระดับที่ใช้ระบายสีการ์ดจึงมาจากคำตอบเดียวกันเสมอ

            อยู่ในการ์ดซึ่งทั้งใบเป็นปุ่ม กดตรงไหนก็เข้าหน้าฝุ่น
            จึงไม่ใส่อะไรที่ต้องกดแยกไว้ตรงนี้ เป็นข้อความอ่านอย่างเดียว

            ทำไมเอามาไว้หน้าหลักด้วย
                หน้าหลักบอกได้แค่ว่าค่าเท่าไรกับระดับอะไร ซึ่งรู้แล้วยังทำอะไรต่อไม่ได้
                คนที่เปิดมาดูเร็ว ๆ แล้วปิดไปจะไม่ได้อะไรกลับไปเลย
                แถบนี้ทำให้อ่านจบแล้วรู้ว่าต้องทำอะไร โดยไม่ต้องกดเข้าไปอีกหน้า */}
        {level && protection.length > 0 && (
          <div
            className="protect home-protect"
            style={{ boxShadow: `inset 4px 0 0 ${level.color}` }}
          >
            <p className="protect-head">ป้องกันตัวอย่างไรที่ระดับ{level.label_th}</p>
            <div className="protect-list">
              {protection.map((item) => (
                <div className="protect-item" key={item.text_th}>
                  <ProtectIcon name={item.icon} color={levelInk(level.color) ?? "currentColor"} />
                  <span>{item.text_th}</span>
                </div>
              ))}
            </div>

            {/* คำแนะนำแยกตามกลุ่มเสี่ยงครบทุกกลุ่ม
                ข้อปฏิบัติสามข้อข้างบนเป็นของทุกคนเหมือนกัน ส่วนตรงนี้คือส่วนที่ต่างกัน
                ที่ระดับส้ม เด็กเล็กได้ว่าให้อยู่ในอาคารที่ปิดประตูหน้าต่าง
                ส่วนคนทำงานกลางแจ้งได้ว่าให้สวมหน้ากากตลอดเวลาทำงานและพักในที่ร่มบ่อยขึ้น
                ซึ่งคนละเรื่องกันแม้ค่าฝุ่นเท่ากัน

                กลุ่มที่ผู้ใช้เลือกไว้ตอนตั้งโปรไฟล์ถูกยกขึ้นมาไว้บนสุดและติดป้ายกำกับ
                ค่านั้นเก็บอยู่ในฐานข้อมูลมาตลอดแต่ไม่เคยมีที่ใช้ */}
            {advice && advice.groups.length > 0 && (
              <ul className="protect-groups">
                {[...advice.groups]
                  .sort((a, b) => {
                    if (a.key === riskGroup) return -1;
                    if (b.key === riskGroup) return 1;
                    return 0;
                  })
                  .map((group) => (
                    <li key={group.key}>
                      <span
                        className="protect-group-dot"
                        style={{ background: level.color }}
                      />
                      <div>
                        <p className="protect-group-name">
                          {group.label_th}
                          {group.key === riskGroup && <em>กลุ่มของคุณ</em>}
                        </p>
                        <p className="protect-group-text">{group.advice_th}</p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <span className="home-card-go">เข้าดูข้อมูล →</span>
      </button>

      {/* กราฟความเสี่ยงรายชั่วโมงกลับมาอยู่หน้าหลักตามที่ขอ
          อยู่นอกการ์ด ไม่ใช่ในการ์ด เพราะการ์ดทั้งใบเป็นปุ่ม
          กราฟที่ชี้เมาส์แล้วขึ้นค่าจะกดโดนปุ่มจนเปลี่ยนหน้าแทน */}
      <DiseaseRisk summary={summary} />
    </div>
  );
}
