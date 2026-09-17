import { useEffect, useState } from "react";
import type { DiseaseAdvice as DiseaseAdviceData } from "../api";
import { api } from "../api";

type Props = {
  provinces: string[];
  /** พื้นที่ที่เลือกอยู่ ค่าว่างแปลว่าทั้งประเทศ ใช้ร่วมกับหน้าอื่น */
  area: string;
  onAreaChange: (province: string) => void;
};

/** ไอคอนของแต่ละโรค วาดเส้นเรียบง่ายให้เข้ากับไอคอนอื่นในระบบ */
function DiseaseIcon({ name }: { name: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "lungs":
      return (
        <svg {...common}>
          <path d="M12 4v7M12 11c-1.5 1-3 1.5-4 1.5M12 11c1.5 1 3 1.5 4 1.5" />
          <path d="M8 7C5 8 4 12 4 16c0 2 1 3 3 3s3-1 3-3V9" />
          <path d="M16 7c3 1 4 5 4 9 0 2-1 3-3 3s-3-1-3-3V9" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
          <path d="M5 12h3l1.5-2.5 2 5 1.5-2.5h6" />
        </svg>
      );
    case "nose":
      return (
        <svg {...common}>
          <path d="M12 4c-1 4-4 8-4 11a3 3 0 0 0 3 2h2a3 3 0 0 0 3-2c0-3-3-7-4-11z" />
          <path d="M9.5 17.5a1.5 1.5 0 1 1-2-1.4M14.5 17.5a1.5 1.5 0 1 0 2-1.4" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.5-1.5L7 13" />
        </svg>
      );
  }
}

/** หน้าโรคจากฝุ่น คำแนะนำสำหรับผู้มีโรคประจำตัว การ์ดละหนึ่งโรค
 *
 * ใช้แทนตัวเลขความเสี่ยงเป็นเปอร์เซ็นต์ของหน้าเดิม เพราะตัวเลขดูแม่นเกินจริง
 * คำแนะนำเปลี่ยนตามระดับฝุ่นของพื้นที่ที่เลือก ถ้อยคำและที่มาอยู่ใน backend/app/disease_advice.py
 */
export function DiseaseAdvice({ provinces, area, onAreaChange }: Props) {
  const [data, setData] = useState<DiseaseAdviceData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api
      .diseaseAdvice(area || null)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [area]);

  return (
    <section className="dadv">
      <div className="dadv-head">
        <h2 className="dadv-title">คำแนะนำสำหรับผู้มีโรคประจำตัว</h2>
        <div className="dadv-scope">
          <label className="card-group-picker">
            <span className="sr-only">เลือกพื้นที่</span>
            <select value={area} onChange={(event) => onAreaChange(event.target.value)}>
              <option value="">ทั้งประเทศ</option>
              {provinces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {data?.level && (
            <span className="dadv-level">
              <span className="dadv-dot" style={{ background: data.level.color }} aria-hidden="true" />
              {data.level.label_th}
              {data.pm25 != null ? ` ${data.pm25} µg/m³` : ""}
            </span>
          )}
        </div>
      </div>

      {failed && <p className="empty">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</p>}
      {!data && !failed && <p className="empty">กำลังโหลดคำแนะนำ...</p>}

      {data && (
        <>
          {/* การ์ดสูงแถวละสี่ใบตามแบบที่วาดไว้ ใบละหนึ่งโรค */}
          <div className="dadv-panel">
            {data.diseases.map((item) => (
              <article className="dadv-card" key={item.name}>
                <span className="dadv-icon">
                  <DiseaseIcon name={item.icon} />
                </span>
                <h3 className="dadv-name">{item.name}</h3>
                <p className="dadv-label">คำแนะนำตอนนี้{item.general ? " · ใช้คำแนะนำทั่วไป" : ""}</p>
                {item.advice.length > 0 ? (
                  <ul className="dadv-advice">
                    {item.advice.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="dadv-label">ยังไม่มีค่าฝุ่นล่าสุดของพื้นที่นี้</p>
                )}
                <p className="dadv-warning">{item.warning_th}</p>
              </article>
            ))}
          </div>

          <p className="dadv-source">
            {data.disclaimer_th} · ที่มา: {data.source_th}{" "}
            <a href={data.source_url} target="_blank" rel="noreferrer">
              ดูข่าวกรมอนามัย
            </a>
          </p>
        </>
      )}
    </section>
  );
}
