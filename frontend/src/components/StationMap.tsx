import { useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import type { ProvinceRank, StationReading } from "../api";
import { ProvinceLayer } from "./ProvinceLayer";
import { ProvinceDetail } from "./ProvinceDetail";

type Props = {
  /** สถานีทั้งหมด ใช้แสดงรายชื่อในแผงของจังหวัดที่กดเลือก */
  stations: StationReading[];
  onSelect: (code: string) => void;
  /** ค่าเฉลี่ยรายจังหวัด ใช้กำหนดสีของแต่ละจังหวัด */
  ranking: ProvinceRank[];
  /** จังหวัดที่กดเลือกอยู่ ว่างแปลว่ายังไม่ได้เลือก */
  picked: string | null;
  onPick: (province: string | null) => void;
};

// กรอบครอบคลุมประเทศไทย ตั้งแต่ปลายสุดของนราธิวาสถึงเหนือสุดของเชียงราย
// และจากชายแดนตะวันตกของแม่ฮ่องสอนถึงตะวันออกสุดของอุบลราชธานี
const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [5.6, 97.3],
  [20.5, 105.7],
];

// ขอบเขตที่อนุญาตให้เลื่อนแผนที่ เผื่อจากกรอบประเทศไว้เล็กน้อย
// เพื่อให้จังหวัดที่อยู่ริมขอบยังเลื่อนเข้ามากลางจอได้
const PAN_LIMIT: [[number, number], [number, number]] = [
  [4.5, 95.5],
  [21.5, 107.5],
];

// ระดับซูมต่ำสุดที่ยังเห็นประเทศไทยเต็มประเทศ ต่ำกว่านี้จะเริ่มเห็นประเทศอื่น
const MIN_ZOOM = 5;

// ซูมเข้าได้ลึกสุดถึงระดับอำเภอ พอสำหรับดูรูปร่างจังหวัดเล็ก ๆ อย่างสมุทรสงคราม
const MAX_ZOOM = 12;

/** บังคับให้จุดกลางของแผนที่อยู่ในประเทศไทยเสมอ
 *
 * ที่ต้องเขียนเองเพราะ maxBounds ของ Leaflet เอาไม่อยู่ในกรณีของเรา
 * เมื่อพื้นที่ที่มองเห็นกว้างกว่ากรอบที่กำหนด Leaflet จะยอมให้เลื่อนอิสระ
 * ซึ่งเกิดขึ้นที่ระดับซูมต่ำสุด เพราะการเห็นประเทศไทยทั้งประเทศ (สูง 15 องศา)
 * ในกรอบแผนที่ขนาดนี้ ทำให้เห็นพื้นที่กว้างกว่าตัวประเทศอยู่แล้ว
 *
 * ทดสอบพบว่าถ้าไม่มีตัวนี้ ลากขึ้นเหนือไปถึงไซบีเรียได้
 */
function KeepInsideThailand() {
  const map = useMap();

  useEffect(() => {
    const clampToCountry = () => {
      const center = map.getCenter();
      const [[south, west], [north, east]] = THAILAND_BOUNDS;
      const lat = Math.min(Math.max(center.lat, south), north);
      const lng = Math.min(Math.max(center.lng, west), east);

      // ขยับกลับเฉพาะเมื่อออกนอกกรอบจริง เลี่ยงการสั่งเลื่อนวนไม่สิ้นสุด
      if (Math.abs(lat - center.lat) > 0.02 || Math.abs(lng - center.lng) > 0.02) {
        map.panTo([lat, lng]);
      }
    };

    map.on("moveend", clampToCountry);
    return () => {
      map.off("moveend", clampToCountry);
    };
  }, [map]);

  return null;
}

/**
 * แผนที่ระบายสีค่าฝุ่นรายจังหวัด
 *
 * ทำไมไม่มีภาพถนนเป็นฉากหลัง
 *     รูปจังหวัดบอกตำแหน่งในตัวมันเองอยู่แล้ว ภาพถนนจึงกลายเป็นลายรบกวน
 *     ใต้สีที่ต้องอ่าน และยังทำให้สีเพี้ยนเพราะพื้นที่ระบายเป็นสีโปร่ง
 *     ลายข้างล่างทะลุขึ้นมาปนกัน
 *
 *     ผลพลอยได้คือแผนที่นี้ไม่ต้องโหลดภาพจากอินเทอร์เน็ตเลยสักแผ่น
 *     ขึ้นทันทีไม่ต้องรอ และเปิดได้แม้เน็ตไม่ติด
 *
 * ความต่างภายในจังหวัดหายไปไหน
 *     สีของจังหวัดมาจากค่าเฉลี่ย ซึ่งกลบความต่างภายใน
 *     การกดเข้าไปดูรายละเอียดจะเห็นสถานีทุกแห่งพร้อมค่าของแต่ละแห่ง
 *     ซึ่งเป็นที่ที่ความต่างนั้นถูกเปิดเผย
 */
export function StationMap({ stations, onSelect, ranking, picked, onPick }: Props) {
  // สถานีของจังหวัดที่กดเลือก เรียงจากค่าสูงไปต่ำ
  // เรียงแบบนี้เพราะจุดที่แย่ที่สุดคือสิ่งที่ควรเห็นก่อน ไม่ใช่ตามชื่อ
  const pickedStations = picked
    ? stations
        .filter((station) => station.province === picked)
        .sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
    : [];

  return (
    <section className="panel">
      <h2 className="panel-title">
        แผนที่คุณภาพอากาศ
        <span className="panel-hint">
          {ranking.length} จังหวัดที่มีข้อมูล · กดที่จังหวัดเพื่อดูรายละเอียด
        </span>
      </h2>

      <div className={picked ? "map-wrapper with-detail" : "map-wrapper"}>
        <MapContainer
          bounds={THAILAND_BOUNDS}
          boundsOptions={{ padding: [24, 24] }}
          maxBounds={PAN_LIMIT}
          maxBoundsViscosity={1}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          scrollWheelZoom
          className="map map-plain"
        >
          <KeepInsideThailand />
          <ProvinceLayer ranking={ranking} selected={picked} onSelect={onPick} />
        </MapContainer>

        {picked && (
          <ProvinceDetail
            province={picked}
            rank={ranking.find((row) => row.province === picked)}
            stations={pickedStations}
            onClose={() => onPick(null)}
            onSelectStation={onSelect}
          />
        )}
      </div>
    </section>
  );
}
