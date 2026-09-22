import type { ProvinceRank } from "../api";

type Props = {
  ranking: ProvinceRank[];
  limit?: number;
};

/** ค่าฝุ่นเฉลี่ยต้องเกินเท่านี้จึงจะขึ้นอันดับ
 *
 * เดิมเอา 15 อันดับแรกเสมอ ซึ่งวันที่อากาศดีทั้งประเทศก็ยังมีตารางยาวเต็มหน้า
 * ทำให้ดูเหมือนมีจังหวัดที่น่าห่วงตลอดเวลา ทั้งที่บางวันค่าสูงสุดยังไม่ถึงสิบ
 * เกณฑ์นี้ผู้จัดทำกำหนดเอง ไม่ได้อ้างมาตรฐานใด ตั้งไว้ต่ำกว่าเกณฑ์ของ
 * องค์การอนามัยโลกที่ 15 เพื่อให้ยังเห็นจังหวัดที่เริ่มมีแนวโน้มสูงขึ้น
 */
const MIN_PM25 = 10;

/** ตารางอันดับจังหวัดตามค่าฝุ่นเฉลี่ย เฉพาะจังหวัดที่เกินเกณฑ์ */
export function ProvinceRanking({ ranking, limit = 15 }: Props) {
  const passed = ranking.filter((item) => item.pm25_avg > MIN_PM25);
  const shown = passed.slice(0, limit);
  const highest = shown[0]?.pm25_avg ?? 1;

  return (
    <section className="panel">
      {/* บอกให้ชัดว่าเป็นค่าเฉลี่ยของสถานีในจังหวัด ไม่ใช่ค่าของสถานีใดสถานีหนึ่ง
          จังหวัดที่มีหลายสถานีจะถูกเฉลี่ยจนต่ำกว่าสถานีที่แย่ที่สุดในจังหวัดนั้นมาก
          เช่น จังหวัดที่มีสถานีค่า 26 แต่มีอีกห้าสถานีค่าต่ำ เฉลี่ยแล้วเหลือ 15 */}
      <h2 className="panel-title">
        อันดับจังหวัดที่ค่าฝุ่นสูงที่สุด
        <span className="panel-hint">
          ค่าเฉลี่ยของสถานีในจังหวัด · แสดงเฉพาะจังหวัดที่เกิน {MIN_PM25} µg/m³ ·{" "}
          {passed.length} จาก {ranking.length} จังหวัดที่มีข้อมูล
        </span>
      </h2>
      {/* วันที่ทุกจังหวัดต่ำกว่าเกณฑ์ ต้องบอกให้ชัดว่าอากาศดี
          ไม่ใช่ปล่อยให้ตารางว่างจนดูเหมือนระบบพัง */}
      {shown.length === 0 && (
        <p className="ranking-none">
          วันนี้ยังไม่มีจังหวัดใดที่ค่าฝุ่นเฉลี่ยเกิน {MIN_PM25} µg/m³
          <small>คุณภาพอากาศอยู่ในเกณฑ์ดีทั้งประเทศ</small>
        </p>
      )}

      <ol className="ranking">
        {shown.map((item, index) => (
          <li key={item.province} className="ranking-row">
            <span className="ranking-no">{index + 1}</span>
            <span className="ranking-name">
              {item.province}
              <small>{item.station_count} สถานี</small>
            </span>
            <span className="ranking-bar-track">
              <span
                className="ranking-bar"
                style={{
                  width: `${(item.pm25_avg / highest) * 100}%`,
                  backgroundColor: item.level.color,
                }}
              />
            </span>
            <span className="ranking-value">{item.pm25_avg}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
