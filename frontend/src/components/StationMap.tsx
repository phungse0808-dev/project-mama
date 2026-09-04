import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { ProvinceRank, StationReading } from "../api";
import { formatThaiDateTime } from "../api";
import { ProvinceLayer } from "./ProvinceLayer";
import { ProvinceDetail } from "./ProvinceDetail";

type Props = {
  stations: StationReading[];
  onSelect: (code: string) => void;
  /** ค่าเฉลี่ยรายจังหวัด ใช้ระบายสีเมื่อสลับไปโหมดรายจังหวัด */
  ranking: ProvinceRank[];
};

/** สองวิธีมองข้อมูลชุดเดียวกัน */
type MapMode = "stations" | "provinces";

// กรอบครอบคลุมประเทศไทย ตั้งแต่ปลายสุดของนราธิวาสถึงเหนือสุดของเชียงราย
// และจากชายแดนตะวันตกของแม่ฮ่องสอนถึงตะวันออกสุดของอุบลราชธานี
const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [5.6, 97.3],
  [20.5, 105.7],
];

// ขอบเขตที่อนุญาตให้เลื่อนแผนที่ เผื่อจากกรอบประเทศไว้เล็กน้อย
// เพื่อให้สถานีที่อยู่ริมขอบยังเลื่อนเข้ามากลางจอได้
const PAN_LIMIT: [[number, number], [number, number]] = [
  [4.5, 95.5],
  [21.5, 107.5],
];

// ระดับซูมต่ำสุดที่ยังเห็นประเทศไทยเต็มประเทศ ต่ำกว่านี้จะเริ่มเห็นประเทศอื่น
const MIN_ZOOM = 5;

// ซูมเข้าได้ลึกสุดถึงระดับถนน พอสำหรับดูว่าสถานีตั้งอยู่บริเวณใด
const MAX_ZOOM = 15;

/** คำนวณกรอบแผนที่จากตำแหน่งสถานีจริง
 *
 * ใช้วิธีนี้แทนการกำหนดจุดกึ่งกลางกับระดับซูมตายตัว เพราะระดับซูมที่พอดี
 * ขึ้นกับขนาดของกรอบแผนที่ซึ่งต่างกันไปตามหน้าจอ ถ้ากำหนดตายตัว
 * บนจอแคบจะเห็นทะเลมากกว่าแผ่นดิน
 */
function boundsOf(
  stations: StationReading[],
): [[number, number], [number, number]] {
  if (stations.length === 0) return THAILAND_BOUNDS;
  const lats = stations.map((s) => s.latitude);
  const lngs = stations.map((s) => s.longitude);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

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

/** ขนาดหมุดสะท้อนความรุนแรง ค่าฝุ่นยิ่งสูงหมุดยิ่งใหญ่ */
function radiusFor(pm25: number | null): number {
  if (pm25 === null) return 4;
  return Math.min(18, 4 + pm25 / 6);
}

export function StationMap({ stations, onSelect, ranking }: Props) {
  const [mode, setMode] = useState<MapMode>("stations");
  const [picked, setPicked] = useState<string | null>(null);

  // สถานีของจังหวัดที่กดเลือก เรียงจากค่าสูงไปต่ำ
  // เรียงแบบนี้เพราะจุดที่แย่ที่สุดคือสิ่งที่ควรเห็นก่อน ไม่ใช่ตามชื่อ
  const pickedStations = picked
    ? stations
        .filter((station) => station.province === picked)
        .sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
    : [];

  return (
    <section className="panel">
      {/* บอกจำนวนหมุดที่แสดงจริง เพราะสถานีที่ข้อมูลค้างจะไม่ขึ้นบนแผนที่
          ตัวเลขนี้จึงน้อยกว่าจำนวนสถานีทั้งหมดในแผงคุณภาพข้อมูล */}
      <h2 className="panel-title">
        แผนที่คุณภาพอากาศ
        <span className="panel-hint">
          {mode === "stations"
            ? `${stations.length} สถานีที่ยังส่งข้อมูล · คลิกที่หมุดเพื่อดูรายละเอียด`
            : `${ranking.length} จังหวัดที่มีข้อมูล · เอาเมาส์ชี้ที่จังหวัดเพื่อดูค่า`}
        </span>
      </h2>

      {/* ปุ่มสลับสองมุมมองของข้อมูลชุดเดียวกัน
          หมุดตอบว่าค่าที่จุดวัดเป็นเท่าไร สีตอบว่าภูมิภาคไหนหนักกว่ากัน */}
      <div className="map-modes" role="group" aria-label="เลือกวิธีแสดงแผนที่">
        <button
          className={mode === "stations" ? "map-mode on" : "map-mode"}
          onClick={() => {
            setMode("stations");
            setPicked(null);
          }}
        >
          หมุดรายสถานี
        </button>
        <button
          className={mode === "provinces" ? "map-mode on" : "map-mode"}
          onClick={() => setMode("provinces")}
        >
          ระบายสีรายจังหวัด
        </button>
      </div>
      <div className={picked ? "map-wrapper with-detail" : "map-wrapper"}>
        <MapContainer
          bounds={boundsOf(stations)}
          boundsOptions={{ padding: [24, 24] }}
          maxBounds={PAN_LIMIT}
          maxBoundsViscosity={1}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          scrollWheelZoom
          className="map"
        >
          {/* ไม่กำหนด bounds ที่ชั้นภาพแผนที่ ไม่เช่นนั้นภาพจะโหลดเฉพาะในกรอบที่กำหนด
              แล้วเหลือพื้นที่ว่างเปล่าที่ขอบซ้ายขวาของกรอบแผนที่
              การจำกัดการเลื่อนทำที่ระดับแผนที่ด้วย maxBounds และตัวดึงจุดกลางกลับอยู่แล้ว */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          />
          <KeepInsideThailand />
          {mode === "provinces" && (
            <ProvinceLayer ranking={ranking} selected={picked} onSelect={setPicked} />
          )}
          {mode === "stations" &&
            stations.map((station) => (
            <CircleMarker
              key={station.station_code}
              center={[station.latitude, station.longitude]}
              radius={radiusFor(station.pm25)}
              pathOptions={{
                color: "#ffffff",
                weight: 1,
                fillColor: station.level.color,
                fillOpacity: 0.85,
              }}
            >
              <Popup>
                <div className="popup">
                  <strong>{station.name_th}</strong>
                  <p className="popup-province">จังหวัด{station.province}</p>
                  <p
                    className="popup-level"
                    style={{ background: station.level.color }}
                  >
                    {station.level.label_th}
                  </p>
                  <table className="popup-table">
                    <tbody>
                      <tr>
                        <td>PM2.5</td>
                        <td>{station.pm25 ?? "-"} µg/m³</td>
                      </tr>
                      <tr>
                        <td>PM10</td>
                        <td>{station.pm10 ?? "-"} µg/m³</td>
                      </tr>
                      <tr>
                        <td>AQI</td>
                        <td>{station.aqi ?? "-"}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="popup-time">
                    {formatThaiDateTime(station.measured_at)}
                  </p>
                  <button
                    className="popup-button"
                    onClick={() => onSelect(station.station_code)}
                  >
                    ดูกราฟย้อนหลัง
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {picked && (
          <ProvinceDetail
            province={picked}
            rank={ranking.find((row) => row.province === picked)}
            stations={pickedStations}
            onClose={() => setPicked(null)}
            onSelectStation={onSelect}
          />
        )}
      </div>
    </section>
  );
}
