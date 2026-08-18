import { useEffect, useState } from "react";
import { api } from "../api";
import type { Summary, Vulnerability } from "../api";

type Props = {
  summary: Summary | null;
  onOpenAir: () => void;
  onOpenHiv: () => void;
};

/**
 * หน้าหลัก
 *
 * ทำหน้าที่เป็นทางเข้าของทั้งสองส่วน แทนที่จะเป็นปุ่มบนแถบเมนู
 *
 * ข้อดีคือแต่ละทางเข้ามีที่ให้บอกว่าข้างในมีอะไรและตอนนี้ค่าเป็นเท่าไร
 * ผู้ใช้จึงตัดสินใจได้ก่อนกดว่าจะเข้าไปดูอะไร ต่างจากปุ่มบนแถบเมนู
 * ที่มีแค่ชื่อ ต้องกดเข้าไปดูเองว่าข้างในคืออะไร
 */
export function HomePage({ summary, onOpenAir, onOpenHiv }: Props) {
  const [vulnerability, setVulnerability] = useState<Vulnerability | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.vulnerability();
        if (!cancelled) setVulnerability(result);
      } catch {
        if (!cancelled) setVulnerability(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const top = vulnerability?.provinces?.[0] ?? null;

  return (
    <div className="two-column">
      <button className="panel home-card" onClick={onOpenAir}>
        <h2 className="home-card-title">วัดคุณภาพอากาศ</h2>
        <p className="home-card-detail">
          ค่าฝุ่นล่าสุดทุกสถานี แผนที่ อันดับจังหวัด กราฟย้อนหลัง
          คำแนะนำที่ตรงกับตัวคุณ และผลกระทบต่อสุขภาพ
        </p>

        <div className="home-stats">
          <div>
            <p className="home-stat-value">{summary?.pm25_avg ?? "—"}</p>
            <p className="home-stat-label">µg/m³ เฉลี่ยทั้งประเทศ</p>
          </div>
          <div>
            <p className="home-stat-value">{summary?.stations_reporting ?? "—"}</p>
            <p className="home-stat-label">สถานีที่รายงานข้อมูล</p>
          </div>
          <div>
            <p className="home-stat-value">{summary?.pm25_max ?? "—"}</p>
            <p className="home-stat-label">
              สูงสุด{summary?.worst_station ? ` · ${summary.worst_station.province}` : ""}
            </p>
          </div>
        </div>

        <span className="home-card-go">เข้าดูข้อมูล →</span>
      </button>

      <button className="panel home-card" onClick={onOpenHiv}>
        <h2 className="home-card-title">HIV</h2>
        <p className="home-card-detail">
          พื้นที่ที่ควรเฝ้าระวังก่อน จากค่าฝุ่นรวมกับสัดส่วนผู้มีภูมิคุ้มกันบกพร่อง
          ซึ่งเสี่ยงต่อการติดเชื้อทางเดินหายใจจากฝุ่นมากกว่าคนทั่วไป
        </p>

        <div className="home-stats home-stats-stacked">
          <div>
            <p className="home-stat-value">{vulnerability?.province_count ?? "—"}</p>
            <p className="home-stat-label">จังหวัดที่มีข้อมูล</p>
          </div>
          <div>
            <p className="home-stat-value home-stat-text">{top?.province ?? "—"}</p>
            <p className="home-stat-label">อันดับ 1 ที่ควรเฝ้าระวัง</p>
          </div>
        </div>

        <span className="home-card-go">เข้าดูข้อมูล →</span>
      </button>
    </div>
  );
}
