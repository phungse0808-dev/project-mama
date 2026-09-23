import { useEffect, useMemo, useRef, useState } from "react";
import type { ProvinceRank, StationReading } from "../api";
import "./SearchBox.css";

type Props = {
  stations: StationReading[];
  ranking: ProvinceRank[];
  /** เลือกสถานีจากผลค้นหา พาไปดูรายละเอียดสถานีนั้น */
  onPickStation: (stationCode: string) => void;
  /** เลือกจังหวัดจากผลค้นหา เปลี่ยนพื้นที่ที่กำลังดูทั้งเว็บ */
  onPickProvince: (province: string) => void;
};

/** แสดงผลลัพธ์อย่างละไม่เกินเท่านี้ ยาวกว่านี้ต้องเลื่อนในกล่อง อ่านยาก */
const MAX_PROVINCES = 4;
const MAX_STATIONS = 6;

/** ช่องค้นหาบนแถบเมนู พิมพ์แล้วผลหล่นลงมาทันที
 *
 * เดิมเป็นปุ่มที่กดแล้วเปิดหน้าต่างทับจอ ผู้ใช้ต้องกดก่อนจึงจะรู้ว่าค้นหาได้
 * ช่องที่เห็นตลอดบอกตัวเองว่าใช้ทำอะไร และพิมพ์ได้เลยโดยไม่ต้องกดเปิดก่อน
 *
 * ผลลัพธ์แยกเป็นจังหวัดกับสถานี เพราะคนส่วนใหญ่ค้นด้วยชื่อจังหวัด
 * ถ้ามีแต่รายชื่อสถานีจะต้องรู้จักชื่อสถานีก่อนจึงจะหาเจอ
 * และโชว์ค่าฝุ่นกับระดับไปด้วยเลย หลายครั้งผู้ใช้อยากรู้แค่ตัวเลขนี้
 */
export function SearchBox({ stations, ranking, onPickStation, onPickProvince }: Props) {
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // ปิดผลลัพธ์เมื่อกดที่อื่นหรือกด Esc ตามที่ผู้ใช้คาดหวังกับกล่องลอย
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const text = keyword.trim();

  const provinceHits = useMemo(
    () => (text ? ranking.filter((item) => item.province.includes(text)) : []).slice(0, MAX_PROVINCES),
    [text, ranking]
  );

  const stationHits = useMemo(
    () =>
      (text
        ? stations.filter(
            (station) => station.name_th.includes(text) || station.province.includes(text)
          )
        : []
      ).slice(0, MAX_STATIONS),
    [text, stations]
  );

  const empty = text !== "" && provinceHits.length === 0 && stationHits.length === 0;
  const showResults = open && text !== "";

  const choose = (action: () => void) => {
    action();
    setKeyword("");
    setOpen(false);
  };

  return (
    <div className="sbox" ref={boxRef}>
      <label className="sbox-field">
        <span className="sr-only">ค้นหาจังหวัดหรือสถานี</span>
        <svg
          className="sbox-icon"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="ค้นหาจังหวัดหรือสถานี"
          autoComplete="off"
        />
      </label>

      {showResults && (
        <div className="sbox-drop">
          {empty && <p className="sbox-empty">ไม่พบจังหวัดหรือสถานีที่ตรงกับคำค้นนี้</p>}

          {provinceHits.length > 0 && (
            <>
              <p className="sbox-group">จังหวัด</p>
              {provinceHits.map((item) => (
                <button
                  key={item.province}
                  className="sbox-item"
                  onClick={() => choose(() => onPickProvince(item.province))}
                >
                  <span className="sbox-name">
                    {item.province}
                    <small>{item.station_count} สถานี</small>
                  </span>
                  <span className="sbox-value">{item.pm25_avg}</span>
                  <span className="sbox-level">
                    <i style={{ background: item.level.color }} aria-hidden="true" />
                    {item.level.label_th}
                  </span>
                </button>
              ))}
            </>
          )}

          {stationHits.length > 0 && (
            <>
              <p className="sbox-group">สถานีตรวจวัด</p>
              {stationHits.map((station) => (
                <button
                  key={station.station_code}
                  className="sbox-item"
                  onClick={() => choose(() => onPickStation(station.station_code))}
                >
                  <span className="sbox-name">
                    {station.name_th}
                    <small>{station.province}</small>
                  </span>
                  {/* ค่าของสถานีเป็น null ได้เมื่อเครื่องไม่ส่งค่ามาในชั่วโมงนั้น */}
                  <span className="sbox-value">{station.pm25 ?? "—"}</span>
                  <span className="sbox-level">
                    <i style={{ background: station.level.color }} aria-hidden="true" />
                    {station.is_stale ? "ข้อมูลค้าง" : station.level.label_th}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
