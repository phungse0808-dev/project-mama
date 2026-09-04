import { useEffect } from "react";
import { MapContainer, useMap } from "react-leaflet";
import type { ProvinceRank, StationReading, Summary } from "../api";
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
  /** รายการระดับคุณภาพอากาศ ใช้เขียนคำอธิบายสีข้างแผนที่ */
  levels: Summary["levels"];
};

// กรอบครอบคลุมประเทศไทย ตั้งแต่ปลายสุดของนราธิวาสถึงเหนือสุดของเชียงราย
// และจากชายแดนตะวันตกของแม่ฮ่องสอนถึงตะวันออกสุดของอุบลราชธานี
const THAILAND_BOUNDS: [[number, number], [number, number]] = [
  [5.6, 97.3],
  [20.5, 105.7],
];

// ขีดล่างชั่วคราวตอนกำลังจัดกรอบ ต้องต่ำกว่าระดับที่พอดีจริงเสมอ
//
// ระดับที่ย่อได้ต่ำสุดจริง ๆ ไม่ได้กำหนดตายตัว แต่คำนวณหลังจัดกรอบเสร็จ
// ว่าพอดีกับกล่องที่ระดับไหน แล้วล็อกไว้ที่ระดับนั้น ผู้ใช้จึงย่อจนประเทศ
// เล็กจิ๋วกลางจอไม่ได้ ซึ่งเป็นสภาพที่ไม่มีประโยชน์อะไรเลย
//
// ต้องปลดขีดล่างเป็นค่านี้ก่อนจัดกรอบทุกครั้ง ไม่งั้นถ้ากล่องเล็กลง
// ระดับที่พอดีจะต่ำกว่าขีดล่างเดิม แล้วจะถูกดึงกลับจนประเทศล้นกล่อง
const ZOOM_FLOOR = 3;

// ซูมเข้าได้ลึกสุดถึงระดับอำเภอ พอสำหรับดูรูปร่างจังหวัดเล็ก ๆ อย่างสมุทรสงคราม
const MAX_ZOOM = 12;

// จำนวนจังหวัดทั้งประเทศ ใช้หาว่ามีกี่จังหวัดที่ไม่มีสถานีตรวจวัด
// ตรงกับจำนวนรูปร่างในไฟล์แผนที่ ถ้าวันหลังมีการแบ่งจังหวัดใหม่ต้องแก้ทั้งสองที่
const TOTAL_PROVINCES = 77;

/** ขอบเขตที่ยอมให้เลื่อนไปถึง เผื่อจากกรอบประเทศไว้เล็กน้อย
 *
 * เผื่อไว้เพื่อให้จังหวัดริมขอบอย่างนราธิวาสหรือแม่ฮ่องสอน
 * ยังลากเข้ามาอยู่กลางจอได้ ไม่ใช่ติดขอบจนกดยาก
 */
const PAN_LIMIT: [[number, number], [number, number]] = [
  [4.6, 96.0],
  [21.4, 107.0],
];

/** ล็อกแผนที่ไว้ในประเทศไทย แต่ยังลากดูจุดอื่นได้
 *
 * เคยลองล็อกไม่ให้ลากเลย แล้วพบว่าใช้งานไม่ได้จริง
 *     พอซูมเข้าไปดูจังหวัดเล็ก ๆ รอบกรุงเทพฯ แล้วอยากไปดูภาคใต้ต่อ
 *     ทำไม่ได้เลย ต้องย่อสุดแล้วซูมเข้าใหม่ ซึ่งน่ารำคาญกว่าปัญหาที่ตั้งใจแก้
 *
 * ปัญหาเดิมที่กลัวคือหลงออกไปนอกประเทศแล้วหาทางกลับไม่เจอ
 *     แก้ด้วยการล็อกขอบแทนการห้ามลาก
 *     maxBoundsViscosity เป็นหนึ่งคือขอบแข็งสนิท ลากออกไปไม่ได้เลย
 *     ไม่ใช่แค่ดึงกลับหลังปล่อยมือ จึงไม่มีทางหลุดออกไปตั้งแต่แรก
 *
 * ซูมกลับมาเข้าหาตำแหน่งเมาส์ตามค่าปกติ
 *     เมื่อลากได้แล้ว การซูมเข้าหาจุดที่ชี้อยู่เป็นพฤติกรรมที่คนคุ้นเคย
 *     และช่วยให้เข้าไปหาจังหวัดที่ต้องการได้เร็วกว่าการยึดจุดกลาง
 */
const LOCKED = {
  dragging: true,
  keyboard: true,
  maxBounds: PAN_LIMIT,
  maxBoundsViscosity: 1,
} as const;

/** บอกแผนที่ให้วัดกล่องใหม่และจัดประเทศให้พอดีเมื่อกล่องเปลี่ยนขนาด
 *
 * ทำไมต้องมี
 *     ไลบรารีแผนที่คอยฟังแค่การเปลี่ยนขนาดของหน้าต่าง ไม่ได้ฟังกล่องของตัวเอง
 *     พอกดเลือกจังหวัด แผงรายละเอียดมาแบ่งที่ กล่องแผนที่แคบลงทันที
 *     แต่แผนที่ยังคิดว่าตัวเองกว้างเท่าเดิม ภาพจึงถูกตัดและประเทศไม่อยู่กลางกล่อง
 *
 * ทำไมต้องจัดกรอบใหม่ด้วย ไม่ใช่แค่วัดใหม่
 *     การวัดใหม่แก้เรื่องภาพถูกตัด แต่ระดับซูมยังเป็นของกล่องเดิม
 *     ประเทศจึงล้นออกนอกกล่องที่แคบลง ต้องจัดกรอบใหม่ให้พอดีเสมอ
 *
 *     การจัดกรอบใหม่ยังทำหน้าที่เป็นปุ่มกลับบ้านในตัว
 *     เพราะแผนที่ล็อกไว้เลื่อนไม่ได้ คนที่ซูมเข้าไปลึกจะกลับมาเห็นทั้งประเทศ
 *     ได้ด้วยการกดปิดแผงรายละเอียด ซึ่งทำให้กล่องเปลี่ยนขนาดแล้วจัดกรอบใหม่
 */
function FitOnResize({ trigger }: { trigger: unknown }) {
  const map = useMap();

  useEffect(() => {
    const box = map.getContainer();
    let lastWidth = box.clientWidth;
    let lastHeight = box.clientHeight;

    const refit = () => {
      map.invalidateSize();
      map.setMinZoom(ZOOM_FLOOR);
      map.fitBounds(THAILAND_BOUNDS, { padding: [10, 10] });
      // ระดับที่พอดีกับกล่องตอนนี้ กลายเป็นระดับที่ย่อได้ต่ำสุด
      map.setMinZoom(map.getZoom());
    };

    // รอให้เบราว์เซอร์จัดวางกล่องใหม่เสร็จก่อน ไม่งั้นวัดได้ขนาดเดิม
    const timer = window.setTimeout(refit, 60);

    // จัดกรอบใหม่เฉพาะตอนขนาดกล่องเปลี่ยนจริง
    //
    // ตัวเฝ้าดูขนาดถูกปลุกจากหลายอย่างที่ไม่ใช่การเปลี่ยนขนาดจริง
    // รวมถึงการที่ไลบรารีขยับชั้นต่าง ๆ ตอนซูม ถ้าจัดกรอบใหม่ทุกครั้งที่ถูกปลุก
    // การซูมของผู้ใช้จะถูกดึงกลับทันทีจนซูมไม่ได้เลย
    const watcher = new ResizeObserver(() => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      refit();
    });
    watcher.observe(box);

    return () => {
      window.clearTimeout(timer);
      watcher.disconnect();
    };
  }, [map, trigger]);

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
export function StationMap({ stations, onSelect, ranking, picked, onPick, levels }: Props) {
  // สถานีของจังหวัดที่กดเลือก เรียงจากค่าสูงไปต่ำ
  // เรียงแบบนี้เพราะจุดที่แย่ที่สุดคือสิ่งที่ควรเห็นก่อน ไม่ใช่ตามชื่อ
  const pickedStations = picked
    ? stations
        .filter((station) => station.province === picked)
        .sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
    : [];

  // นับว่าตอนนี้มีกี่จังหวัดอยู่ในแต่ละระดับ
  //
  // คำอธิบายสีที่บอกแค่ว่าสีไหนแปลว่าอะไรก็พอใช้ได้ แต่ถ้าบอกจำนวนด้วย
  // มันจะกลายเป็นสรุปสถานการณ์ในตัวเอง อ่านแล้วรู้ทันทีว่าวันนี้ประเทศเป็นยังไง
  // โดยไม่ต้องไล่นับสีบนแผนที่เอง
  const countByLevel = new Map<string, number>();
  for (const row of ranking) {
    const key = row.level.key ?? "";
    countByLevel.set(key, (countByLevel.get(key) ?? 0) + 1);
  }

  // จังหวัดที่ไม่มีสถานีเลย นับจากผลต่างของจังหวัดทั้งประเทศกับจังหวัดที่มีข้อมูล
  const noStation = TOTAL_PROVINCES - ranking.length;

  return (
    <section className="panel">
      <h2 className="panel-title">
        แผนที่คุณภาพอากาศ
        <span className="panel-hint">
          {ranking.length} จังหวัดที่มีข้อมูล · กดที่จังหวัดเพื่อดูรายละเอียด
        </span>
      </h2>

      {/* zoomSnap ยอมให้ซูมเป็นทศนิยมทีละหนึ่งในสิบ
          ค่าตั้งต้นของไลบรารีคือขยับทีละหนึ่งระดับเต็ม ซึ่งหยาบเกินไป
          ระดับที่พอดีกับกรอบมักอยู่ระหว่างสองระดับ ไลบรารีจึงเลือกระดับที่เล็กกว่า
          ผลคือประเทศไทยเล็กนิดเดียวกลางกล่อง เหลือที่ว่างรอบตัวเกินครึ่ง */}
      <div className={picked ? "map-wrapper with-detail" : "map-wrapper"}>
        <MapContainer
          bounds={THAILAND_BOUNDS}
          boundsOptions={{ padding: [10, 10] }}
          zoomSnap={0.1}
          zoomDelta={0.5}
          {...LOCKED}
          minZoom={ZOOM_FLOOR}
          maxZoom={MAX_ZOOM}
          className="map map-plain"
        >
          <FitOnResize trigger={picked} />
          <ProvinceLayer ranking={ranking} selected={picked} onSelect={onPick} />
        </MapContainer>

        {/* คำอธิบายสีวางในที่ว่างด้านขวา ซึ่งเกิดจากประเทศไทยรูปทรงสูงและแคบ
            ยังไงก็เหลือที่ตรงนั้นอยู่แล้ว การเอาไปใช้จึงไม่ได้เบียดแผนที่
            ซ่อนเมื่อกดเลือกจังหวัด เพราะตอนนั้นแผงรายละเอียดมาแทนที่ */}
        {!picked && (
          <div className="map-legend">
            <p className="map-legend-title">ระดับคุณภาพอากาศ</p>
            {levels.map((level) => (
              <div key={level.key} className="map-legend-row">
                <span className="map-legend-swatch" style={{ background: level.color }} />
                <span className="map-legend-name">{level.label_th}</span>
                <span className="map-legend-count">{countByLevel.get(level.key) ?? 0}</span>
              </div>
            ))}
            <div className="map-legend-row none">
              <span className="map-legend-swatch" style={{ background: "#3a4757" }} />
              <span className="map-legend-name">ไม่มีสถานี</span>
              <span className="map-legend-count">{noStation}</span>
            </div>
            <p className="map-legend-note">ตัวเลขคือจำนวนจังหวัดในระดับนั้นตอนนี้</p>
          </div>
        )}

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
