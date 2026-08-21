import type { ProvinceRank } from "../api";

type Props = {
  ranking: ProvinceRank[];
  limit?: number;
};

/** ตารางอันดับจังหวัดตามค่าฝุ่นเฉลี่ย */
export function ProvinceRanking({ ranking, limit = 15 }: Props) {
  const shown = ranking.slice(0, limit);
  const highest = shown[0]?.pm25_avg ?? 1;

  return (
    <section className="panel">
      {/* บอกให้ชัดว่าเป็นค่าเฉลี่ยของสถานีในจังหวัด ไม่ใช่ค่าของสถานีใดสถานีหนึ่ง
          จังหวัดที่มีหลายสถานีจะถูกเฉลี่ยจนต่ำกว่าสถานีที่แย่ที่สุดในจังหวัดนั้นมาก
          เช่น จังหวัดที่มีสถานีค่า 26 แต่มีอีกห้าสถานีค่าต่ำ เฉลี่ยแล้วเหลือ 15 */}
      <h2 className="panel-title">
        อันดับจังหวัดที่ค่าฝุ่นสูงที่สุด
        <span className="panel-hint">
          ค่าเฉลี่ยของสถานีในจังหวัด · จาก {ranking.length} จังหวัด
        </span>
      </h2>
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
