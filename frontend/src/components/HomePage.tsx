import type { Summary } from "../api";

type Props = {
  summary: Summary | null;
  onOpenAir: () => void;
};

/**
 * หน้าหลัก
 *
 * ทำหน้าที่เป็นทางเข้า แทนที่จะพาเข้าหน้าข้อมูลทันทีหลังเข้าระบบ
 *
 * ข้อดีคือทางเข้ามีที่ให้บอกว่าข้างในมีอะไรและตอนนี้ค่าเป็นเท่าไร
 * ผู้ใช้จึงเห็นภาพรวมก่อนกดเข้าไปดูรายละเอียด
 */
export function HomePage({ summary, onOpenAir }: Props) {
  return (
    <div className="home-entry">
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

    </div>
  );
}
