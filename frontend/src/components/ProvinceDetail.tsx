import { useEffect, useState } from "react";
import { api } from "../api";
import type { Pm25HourlyPoint, ProvinceRank, StationReading } from "../api";

type Props = {
  province: string;
  /** ค่าสรุปของจังหวัดนี้ ไม่มีแปลว่าจังหวัดนี้ไม่มีสถานีตรวจวัด */
  rank: ProvinceRank | undefined;
  /** สถานีทั้งหมดในจังหวัดนี้ เรียงจากค่าสูงไปต่ำแล้ว */
  stations: StationReading[];
  onClose: () => void;
  onSelectStation: (code: string) => void;
};

/**
 * รายละเอียดของจังหวัดที่กดเลือกบนแผนที่
 *
 * ทำไมต้องมี
 *     แผนที่ระบายสีใช้ค่าเฉลี่ยทั้งจังหวัดเป็นตัวกำหนดสี ซึ่งกลบความต่างภายในจังหวัด
 *     ชลบุรีเป็นตัวอย่างชัดที่สุด สามสถานีให้ค่า 40.3 กับ 12.8 และ 11.3
 *     เฉลี่ยแล้วได้ 21.5 ระบายเป็นสีเขียว คนดูจึงไม่มีทางรู้ว่ามีจุดหนึ่ง
 *     ที่อากาศแย่กว่าค่าเฉลี่ยเกือบเท่าตัว
 *
 *     แผงนี้จึงไม่ใช่ลูกเล่น แต่แก้ข้อจำกัดของการระบายสีทั้งจังหวัดโดยตรง
 */
export function ProvinceDetail({ province, rank, stations, onClose, onSelectStation }: Props) {
  const [hourly, setHourly] = useState<Pm25HourlyPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    setHourly([]);
    void (async () => {
      try {
        const result = await api.pm25Hourly(province, 24);
        if (!cancelled) setHourly(result);
      } catch {
        if (!cancelled) setHourly([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province]);

  // เส้นย้อนหลังวาดเอง ไม่ใช้ไลบรารีกราฟ เพราะเป็นเส้นเล็กไม่มีแกนไม่มีป้าย
  // การเรียกไลบรารีเต็มรูปแบบมาวาดเส้นเดียวไม่คุ้มกับขนาดที่เพิ่มขึ้น
  const values = hourly.map((point) => point.pm25);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const span = high - low || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      // เว้นขอบบนล่างไว้อย่างละสามหน่วย เส้นจะได้ไม่แนบขอบจนดูเหมือนถูกตัด
      const y = 27 - ((value - low) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <aside className="pdetail">
      <header className="pdetail-head">
        <span className="pdetail-name">{province}</span>
        {rank && (
          <>
            <span className="pdetail-dot" style={{ background: rank.level.color }} />
            <span className="pdetail-level">ระดับ{rank.level.label_th}</span>
          </>
        )}
        <button className="pdetail-close" onClick={onClose} aria-label="ปิดรายละเอียดจังหวัด">
          ปิด ✕
        </button>
      </header>

      {!rank ? (
        <p className="pdetail-empty">
          จังหวัดนี้ไม่มีสถานีตรวจวัดของกรมควบคุมมลพิษ ระบบจึงไม่มีค่าฝุ่นของพื้นที่นี้
        </p>
      ) : (
        <>
          <div className="pdetail-figures">
            <div>
              <p className="pdetail-value">{rank.pm25_avg}</p>
              <p className="pdetail-caption">เฉลี่ยทั้งจังหวัด</p>
            </div>
            <div>
              {/* ค่าสูงสุดใช้สีของระดับที่ค่านั้นตกอยู่ ไม่ใช่สีของค่าเฉลี่ย
                  เพราะประเด็นของตัวเลขนี้คือจุดที่แย่ที่สุดแย่แค่ไหน */}
              <p
                className="pdetail-value"
                style={{ color: stations[0]?.level.color ?? rank.level.color }}
              >
                {rank.pm25_max}
              </p>
              <p className="pdetail-caption">สูงสุดในจังหวัด</p>
            </div>
          </div>

          <p className="pdetail-section">สถานีตรวจวัด {rank.station_count} แห่ง</p>
          <ul className="pdetail-stations">
            {stations.map((station) => (
              <li key={station.station_code}>
                <span className="pdetail-station-dot" style={{ background: station.level.color }} />
                <button
                  className="pdetail-station-name"
                  onClick={() => onSelectStation(station.station_code)}
                  title={station.name_th}
                >
                  {station.name_th}
                </button>
                <span className="pdetail-station-value">{station.pm25 ?? "-"}</span>
              </li>
            ))}
          </ul>

          {values.length >= 2 && (
            <>
              <p className="pdetail-section">ย้อนหลัง 24 ชั่วโมง</p>
              <svg
                className="pdetail-spark"
                viewBox="0 0 100 30"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="pdetailFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5ec8ff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#5ec8ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <polygon points={`0,30 ${points} 100,30`} fill="url(#pdetailFill)" />
                <polyline
                  points={points}
                  fill="none"
                  stroke="#5ec8ff"
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <p className="pdetail-range">
                <span>{hourly[0]?.label}</span>
                <span>
                  ต่ำสุด {low} · สูงสุด {high}
                </span>
                <span>{hourly[hourly.length - 1]?.label}</span>
              </p>
            </>
          )}
        </>
      )}
    </aside>
  );
}
