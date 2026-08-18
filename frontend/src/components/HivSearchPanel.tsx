import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { HivStatistics } from "../api";

type SortKey = "cases" | "rate";

/**
 * ค้นหาจำนวนผู้ติดเชื้อเอชไอวีรายจังหวัด
 *
 * เรียงได้สองแบบ และค่าเริ่มต้นคืออัตราต่อแสนคน ไม่ใช่จำนวนคน
 *
 * ที่ตั้งไว้แบบนั้นเพราะจำนวนคนดิบเทียบข้ามจังหวัดไม่ได้ จังหวัดที่มีประชากรมาก
 * ย่อมมีผู้ติดเชื้อมากตามไปด้วย ถ้าเรียงด้วยจำนวนดิบ กรุงเทพฯ จะขึ้นอันดับหนึ่งเสมอ
 * เพราะคนเยอะ ไม่ใช่เพราะสัดส่วนผู้ติดเชื้อสูง การหารด้วยประชากรแล้วคูณแสน
 * ทำให้เทียบกันได้อย่างเป็นธรรม เป็นวิธีมาตรฐานทางระบาดวิทยา
 */
export function HivSearchPanel() {
  const [data, setData] = useState<HivStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("rate");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.hiv();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const all = data?.provinces ?? [];
    const text = keyword.trim();
    const matched = text ? all.filter((item) => item.province.includes(text)) : all;

    return [...matched].sort((a, b) => {
      const left = sortBy === "cases" ? a.cases : a.rate_per_100k;
      const right = sortBy === "cases" ? b.cases : b.rate_per_100k;
      return (right ?? 0) - (left ?? 0);
    });
  }, [data, keyword, sortBy]);

  const highest = rows.length
    ? Math.max(...rows.map((r) => (sortBy === "cases" ? r.cases : r.rate_per_100k) ?? 0))
    : 0;

  if (loading) {
    return (
      <section className="panel">
        <h2 className="panel-title">ค้นหาผู้ติดเชื้อรายจังหวัด</h2>
        <p className="empty">กำลังโหลด...</p>
      </section>
    );
  }

  if (!data?.provinces?.length) {
    return (
      <section className="panel">
        <h2 className="panel-title">
          ค้นหาผู้ติดเชื้อรายจังหวัด <span className="panel-hint">ยังไม่มีข้อมูล</span>
        </h2>
        <p className="empty">
          นำเข้าด้วยคำสั่ง <code>python -m scripts.import_hiv</code>
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        ค้นหาผู้ติดเชื้อรายจังหวัด
        <span className="panel-hint">
          {data.provinces.length} จังหวัด · สถิติปี {data.year}
        </span>
      </h2>

      <div className="weather-controls">
        <label>
          จังหวัด
          <input
            className="hiv-search-input"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="พิมพ์ชื่อจังหวัด เช่น เชียงใหม่"
            autoComplete="off"
          />
        </label>

        <div className="range-buttons">
          <button
            className={sortBy === "rate" ? "range active" : "range"}
            onClick={() => setSortBy("rate")}
          >
            ต่อแสนคน
          </button>
          <button
            className={sortBy === "cases" ? "range active" : "range"}
            onClick={() => setSortBy("cases")}
          >
            จำนวนคน
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          ไม่พบ "{keyword}" ในข้อมูลชุดนี้ ซึ่งมีเพียง {data.provinces.length} จังหวัด
          ไม่ครบทั้งประเทศ
        </p>
      ) : (
        <ol className="ranking">
          {rows.map((item, index) => {
            const value = (sortBy === "cases" ? item.cases : item.rate_per_100k) ?? 0;
            return (
              <li key={item.province} className="ranking-row vulnerability-row">
                <span className="ranking-no">{index + 1}</span>
                <span className="ranking-name">
                  {item.province}
                  <small>
                    ผู้ติดเชื้อ {item.cases?.toLocaleString("th-TH") ?? "-"} คน ·{" "}
                    {item.rate_per_100k ?? "-"} ต่อแสนคน
                  </small>
                </span>
                <span className="ranking-bar-track">
                  <span
                    className="ranking-bar"
                    style={{
                      width: `${highest ? (value / highest) * 100 : 0}%`,
                      background: "#7a5cc4",
                    }}
                  />
                </span>
                <span className="ranking-value">
                  {sortBy === "cases" ? value.toLocaleString("th-TH") : value}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="weather-note">
        ค่าเริ่มต้นเรียงตามอัตราต่อประชากรแสนคน ไม่ใช่จำนวนคน เพราะจำนวนดิบ
        เทียบข้ามจังหวัดไม่ได้ จังหวัดที่มีประชากรมากย่อมมีผู้ติดเชื้อมากตามไปด้วย
        ถ้าเรียงด้วยจำนวนดิบ กรุงเทพฯ จะขึ้นอันดับหนึ่งเสมอเพราะคนเยอะ
        ไม่ใช่เพราะสัดส่วนผู้ติดเชื้อสูง
        <br />
        ข้อมูลจาก {data.source} ครอบคลุมเพียง {data.provinces.length} จังหวัด
        ไม่ใช่ทั้ง 77 จังหวัด เพราะแหล่งเผยแพร่เฉพาะจังหวัดที่มีผู้ติดเชื้อสูงสุด
      </p>
    </section>
  );
}
