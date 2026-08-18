import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import "./Landing.css";
import { SECTIONS } from "./NavBar";
import type { SectionKey } from "./NavBar";
import "./NavBar.css";
import type { AppUser, CollectionHealth, StationReading, Summary } from "../api";

export type EnterOptions = {
  stationCode?: string;
  section?: SectionKey;
};

type Props = {
  user: AppUser | null;
  onEnter: (options?: EnterOptions) => void;
  onSignOut: () => void;
};

// ทางลัดเข้าเมนูต่างๆ ของแดชบอร์ดโดยตรง
const SHORTCUTS: { section: SectionKey; label: string; detail: string }[] = [
  {
    section: "overview",
    label: "ภาพรวมสถานการณ์",
    detail: "ค่าฝุ่นปัจจุบัน คำแนะนำสำหรับคุณ แผนที่ และการแจ้งเตือน",
  },
  {
    section: "data",
    label: "ข้อมูลเชิงลึก",
    detail: "กราฟย้อนหลัง ข้อมูลอากาศ และคุณภาพข้อมูล",
  },
];

// การ์ดอธิบายความสามารถ ใช้สีจากชุดสีระดับคุณภาพอากาศเพื่อให้เป็นชุดเดียวกับทั้งระบบ
const FEATURES = [
  {
    icon: "🗺️",
    tint: "#e8f4ff",
    title: "เฝ้าระวังแบบเรียลไทม์",
    detail:
      "แสดงค่าฝุ่นล่าสุดของทุกสถานีบนแผนที่ พร้อมจัดอันดับจังหวัด และแจ้งเตือนพื้นที่ที่เกินเกณฑ์มาตรฐาน",
  },
  {
    icon: "🫁",
    tint: "#eaf7ee",
    title: "คำแนะนำเฉพาะบุคคล",
    detail:
      "เลือกจังหวัดและกลุ่มเสี่ยงของตัวเอง ระบบจะแนะนำการปฏิบัติตัวให้ตรงกับคุณ ครอบคลุมกลุ่มเปราะบาง 8 กลุ่ม",
  },
  {
    icon: "🌦️",
    tint: "#fff6e0",
    title: "วิเคราะห์ปัจจัยแวดล้อม",
    detail:
      "เทียบค่าฝุ่นกับปริมาณฝน อุณหภูมิ และความเร็วลมย้อนหลังถึงปี 2563 เพื่อเข้าใจว่าอะไรทำให้ฝุ่นสะสมหรือกระจายตัว",
  },
  {
    icon: "🔍",
    tint: "#fdeeec",
    title: "ตรวจสอบคุณภาพข้อมูลได้",
    detail:
      "เปิดเผยความครบถ้วนของข้อมูลและประวัติการเก็บทุกครั้ง เพื่อให้ตรวจสอบย้อนกลับได้ว่าข้อมูลมาจากไหนและขาดช่วงใดบ้าง",
  },
];

/**
 * หน้าแรกก่อนเข้าแดชบอร์ด
 *
 * ไม่ได้เป็นแค่หน้าแนะนำ แต่ค้นหาข้อมูลได้จากตรงนี้เลย
 * ผู้ใช้ส่วนใหญ่เปิดระบบขึ้นมาเพื่อดูค่าฝุ่นในพื้นที่ตัวเองเป็นอันดับแรก
 * จึงควรพิมพ์ชื่อจังหวัดแล้วเห็นคำตอบทันที ไม่ต้องเข้าไปหาในแดชบอร์ดก่อน
 */
export function Landing({ user, onEnter, onSignOut }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [health, setHealth] = useState<CollectionHealth | null>(null);
  const [stations, setStations] = useState<StationReading[]>([]);
  const [keyword, setKeyword] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [summaryData, healthData, stationData] = await Promise.all([
          api.summary(),
          api.collectionHealth(),
          api.stations(),
        ]);
        setSummary(summaryData);
        setHealth(healthData);
        setStations(stationData);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  // จับคู่ทั้งชื่อจังหวัดและชื่อสถานี เพราะผู้ใช้อาจพิมพ์อย่างใดอย่างหนึ่ง
  const matches = useMemo(() => {
    const text = keyword.trim();
    if (!text) return [];
    return stations
      .filter(
        (station) => station.province.includes(text) || station.name_th.includes(text),
      )
      .slice(0, 8);
  }, [keyword, stations]);

  // ถ้าผลลัพธ์อยู่ในจังหวัดเดียวกันทั้งหมด สรุปค่าเฉลี่ยของจังหวัดนั้นให้ก่อน
  const provinceAverage = useMemo(() => {
    if (matches.length === 0) return null;
    const provinces = new Set(matches.map((item) => item.province));
    if (provinces.size !== 1) return null;

    const values = matches
      .map((item) => item.pm25)
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      province: matches[0].province,
      average: Math.round(mean * 10) / 10,
      count: values.length,
    };
  }, [matches]);

  return (
    <main className="landing">
      {/* แถบเมนูด้านบน กดเข้าแต่ละส่วนของระบบได้ทันทีตั้งแต่หน้าแรก */}
      <header className="navbar landing-navbar">
        <div className="navbar-inner">
          <div className="navbar-logo" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <nav className="navbar-menu">
            {SECTIONS.map((item) => (
              <button
                key={item.key}
                className="navbar-item"
                onClick={() => onEnter({ section: item.key })}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {user && (
            <div className="navbar-right">
              <span className="navbar-user">คุณ{user.display_name}</span>
              <button className="navbar-action" onClick={onSignOut}>
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-logo" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <h1>ระบบเฝ้าระวังคุณภาพอากาศ PM2.5</h1>
        <p className="landing-lead">
          ระบบสารสนเทศเฝ้าระวังฝุ่นละอองขนาดเล็กและผลกระทบต่อสุขภาพ
          <br />
          ใช้ข้อมูลจริงที่ระบบเก็บสะสมเองจากแหล่งเปิดของหน่วยงานรัฐ
        </p>

        {failed ? (
          <p className="landing-offline">
            เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่าโปรแกรมเปิดอยู่หรือไม่
          </p>
        ) : (
          <>
            <div className="landing-search">
              <input
                className="landing-search-input"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="ค้นหาจังหวัดหรือชื่อสถานี เช่น เชียงใหม่"
                autoComplete="off"
              />

              {keyword.trim() && (
                <div className="landing-results">
                  {provinceAverage && (
                    <p className="landing-result-summary">
                      จังหวัด{provinceAverage.province} เฉลี่ย{" "}
                      <strong>{provinceAverage.average}</strong> µg/m³ จาก{" "}
                      {provinceAverage.count} สถานี
                    </p>
                  )}

                  {matches.length === 0 ? (
                    <p className="landing-no-result">ไม่พบจังหวัดหรือสถานีที่ตรงกับคำค้นนี้</p>
                  ) : (
                    <ul>
                      {matches.map((station) => (
                        <li key={station.station_code}>
                          <button
                            onClick={() =>
                              onEnter({
                                stationCode: station.station_code,
                                section: "data",
                              })
                            }
                          >
                            <span
                              className="landing-result-dot"
                              style={{ background: station.level.color }}
                            />
                            <span className="landing-result-name">
                              {station.name_th}
                              <small>จังหวัด{station.province}</small>
                            </span>
                            <span className="landing-result-value">
                              {station.pm25 ?? "-"}
                              <small>{station.level.label_th}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="landing-stats">
              <div>
                <p className="landing-stat-value">{health?.stations_total ?? "—"}</p>
                <p className="landing-stat-label">สถานีตรวจวัดทั่วประเทศ</p>
              </div>
              <div>
                <p className="landing-stat-value">
                  {health ? health.readings_total.toLocaleString("th-TH") : "—"}
                </p>
                <p className="landing-stat-label">ค่าตรวจวัดรายชั่วโมงที่เก็บได้</p>
              </div>
              <div>
                <p className="landing-stat-value">
                  {health ? health.weather_total.toLocaleString("th-TH") : "—"}
                </p>
                <p className="landing-stat-label">ข้อมูลอากาศรายวันย้อนหลัง</p>
              </div>
              <div>
                <p className="landing-stat-value">
                  {summary?.pm25_avg ?? "—"}
                  <small> µg/m³</small>
                </p>
                <p className="landing-stat-label">ค่าฝุ่นเฉลี่ยทั้งประเทศขณะนี้</p>
              </div>
            </div>
          </>
        )}

        <button className="landing-button" onClick={() => onEnter()}>
          {user ? `เข้าใช้งานระบบ (คุณ${user.display_name})` : "เข้าใช้งานระบบ"}
        </button>
      </section>

      <div className="landing-body">
        <section>
          <h2 className="landing-section-title">เข้าดูข้อมูลแต่ละส่วนได้ทันที</h2>
          <div className="landing-shortcut-grid">
            {SHORTCUTS.map((item) => (
              <button key={item.section} onClick={() => onEnter({ section: item.section })}>
                <span className="landing-shortcut-label">{item.label}</span>
                <span className="landing-shortcut-detail">{item.detail}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="landing-section-title">ความสามารถของระบบ</h2>
          <div className="landing-features">
            {FEATURES.map((feature) => (
              <article key={feature.title}>
                <div className="landing-feature-icon" style={{ background: feature.tint }}>
                  {feature.icon}
                </div>
                <h2>{feature.title}</h2>
                <p>{feature.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="landing-footer">
          <p>แหล่งข้อมูล</p>
          <div className="landing-sources">
            <span>Air4Thai · กรมควบคุมมลพิษ</span>
            <span>NASA POWER · องค์การนาซา</span>
            <span>สถิติทะเบียนราษฎร · กรมการปกครอง</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
