import type { StationReading } from "../api";

type Props = {
  stations: StationReading[];
  onSelect: (stationCode: string) => void;
  limit?: number;
};

/** ตารางอันดับสถานีตามค่าที่วัดได้ตอนนี้
 *
 * ทำไมต้องมีทั้งที่มีอันดับจังหวัดอยู่แล้ว
 *     อันดับจังหวัดใช้ค่าเฉลี่ยของสถานีทั้งจังหวัด ซึ่งกลบจุดที่แย่ที่สุดไป
 *     กรุงเทพฯ มีสถานีเจ็ดสิบกว่าแห่ง ค่าเฉลี่ยจึงเจือจางจนอยู่ระดับปานกลาง
 *     ทั้งที่บางสถานีอยู่ระดับเริ่มมีผลกระทบต่อสุขภาพแล้ว
 *     คนที่อยู่ใกล้สถานีนั้นเปิดดูอันดับจังหวัดจะเข้าใจว่าปลอดภัยกว่าความจริง
 *
 *     ตารางนี้ไม่เฉลี่ย จึงตอบได้ว่าจุดไหนในประเทศแย่ที่สุดตอนนี้
 */
export function StationRanking({ stations, onSelect, limit = 15 }: Props) {
  // ตัดสถานีที่ข้อมูลค้างออก ใช้เกณฑ์เดียวกับแถบสัดส่วนสถานีด้านบน
  // ไม่งั้นค่าที่ค้างมาหลายชั่วโมงอาจขึ้นอันดับหนึ่งทั้งที่ไม่ใช่สถานการณ์ตอนนี้
  const usable = stations.filter((item) => item.pm25 != null && !item.is_stale);
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => (b.pm25 ?? 0) - (a.pm25 ?? 0));
  const shown = sorted.slice(0, limit);
  const highest = shown[0]?.pm25 ?? 1;

  return (
    <section className="panel">
      <h2 className="panel-title">
        อันดับสถานีที่ค่าฝุ่นสูงที่สุด
        <span className="panel-hint">
          ค่ารายสถานี ไม่ใช่ค่าเฉลี่ยจังหวัด · {usable.length} สถานีที่ส่งข้อมูล
        </span>
      </h2>

      <ol className="ranking">
        {shown.map((item, index) => (
          <li key={item.station_code} className="ranking-row">
            <span className="ranking-no">{index + 1}</span>
            {/* กดชื่อสถานีแล้วเปิดรายละเอียดได้ ใช้เส้นทางเดียวกับช่องค้นหาและแผนที่
                จะได้ไม่ต้องจำชื่อแล้วไปค้นเองอีกรอบ */}
            <button
              type="button"
              className="ranking-name ranking-pick"
              onClick={() => onSelect(item.station_code)}
            >
              {item.name_th}
              <small>{item.province}</small>
            </button>
            <span className="ranking-bar-track">
              <span
                className="ranking-bar"
                style={{
                  width: `${((item.pm25 ?? 0) / highest) * 100}%`,
                  backgroundColor: item.level.color,
                }}
              />
            </span>
            <span className="ranking-value">{item.pm25}</span>
          </li>
        ))}
      </ol>

      {/* ข้อความนี้คือเหตุผลที่ตารางนี้มีอยู่ ต้องอยู่ติดกับตาราง
          ไม่งั้นคนจะสงสัยว่าทำไมมีอันดับสองชุดในหน้าเดียว */}
      <p className="ranking-note">
        ต่างจากอันดับจังหวัดด้านบนตรงที่ไม่เฉลี่ย จังหวัดที่มีหลายสถานีจึงเห็นจุดที่แย่ที่สุดจริง
        ซึ่งค่าเฉลี่ยกลบไป
      </p>
    </section>
  );
}
