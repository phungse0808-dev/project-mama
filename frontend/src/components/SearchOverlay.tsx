import { useEffect, useMemo, useRef, useState } from "react";
import type { StationReading } from "../api";
import "./SearchOverlay.css";

type Props = {
  stations: StationReading[];
  onSelect: (stationCode: string) => void;
  onClose: () => void;
};

/**
 * ช่องค้นหาแบบเปิดทับหน้าจอ
 *
 * เรียกจากปุ่มค้นหาบนแถบเมนู ใช้ได้จากทุกหน้าโดยไม่ต้องกลับไปหน้าแรก
 * เพราะการหาค่าฝุ่นในพื้นที่ที่สนใจเป็นสิ่งที่ผู้ใช้ทำบ่อยที่สุด
 */
export function SearchOverlay({ stations, onSelect, onClose }: Props) {
  const [keyword, setKeyword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // โฟกัสให้พิมพ์ได้ทันทีที่เปิด และปิดด้วยปุ่ม Esc ตามที่ผู้ใช้คาดหวัง
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const matches = useMemo(() => {
    const text = keyword.trim();
    if (!text) return [];
    return stations
      .filter(
        (station) => station.province.includes(text) || station.name_th.includes(text),
      )
      .slice(0, 10);
  }, [keyword, stations]);

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
    <div className="search-backdrop" onClick={onClose}>
      <div className="search-box" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="ค้นหาจังหวัดหรือชื่อสถานี เช่น เชียงใหม่"
          autoComplete="off"
        />

        {keyword.trim() && (
          <div className="search-results">
            {provinceAverage && (
              <p className="search-summary">
                จังหวัด{provinceAverage.province} เฉลี่ย{" "}
                <strong>{provinceAverage.average}</strong> µg/m³ จาก{" "}
                {provinceAverage.count} สถานี
              </p>
            )}

            {matches.length === 0 ? (
              <p className="search-empty">ไม่พบจังหวัดหรือสถานีที่ตรงกับคำค้นนี้</p>
            ) : (
              <ul>
                {matches.map((station) => (
                  <li key={station.station_code}>
                    <button onClick={() => onSelect(station.station_code)}>
                      <span
                        className="search-dot"
                        style={{ background: station.level.color }}
                      />
                      <span className="search-name">
                        {station.name_th}
                        <small>จังหวัด{station.province}</small>
                      </span>
                      <span className="search-value">
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

        <p className="search-hint">กด Esc หรือคลิกนอกกล่องเพื่อปิด</p>
      </div>
    </div>
  );
}
