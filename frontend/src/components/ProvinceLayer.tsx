import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ProvinceRank } from "../api";
import { PROVINCE_BY_CODE } from "../provinceCodes";

type Props = {
  ranking: ProvinceRank[];
  /** จังหวัดที่กดเลือกอยู่ ใช้ตีกรอบให้เห็นว่ากำลังดูอันไหน */
  selected: string | null;
  onSelect: (province: string) => void;
};

/** สีของจังหวัดที่ไม่มีสถานีตรวจวัด
 *
 * ใช้เทาจาง ไม่ใช่สีของระดับใดระดับหนึ่ง เพราะเราไม่รู้ค่าของจังหวัดนั้นจริง ๆ
 * ถ้าระบายเป็นสีฟ้าเหมือนระดับดีมาก คนจะเข้าใจว่าอากาศที่นั่นสะอาด
 * ทั้งที่ความจริงคือไม่มีใครวัด
 *
 * บนธีมพื้นขาวต้องเป็นเทาอ่อน ไม่ใช่เทาเข้มอย่างตอนเป็นธีมมืด
 * เพราะบนพื้นขาว สียิ่งเข้มยิ่งอ่านว่าค่ายิ่งสูง จังหวัดที่ไม่มีข้อมูล
 * จะกลายเป็นดูเหมือนจังหวัดที่อากาศแย่ที่สุดในประเทศทันที
 */
const NO_DATA_COLOR = "#d9dee6";

/**
 * ชั้นระบายสีรายจังหวัดบนแผนที่
 *
 * ต่างจากหมุดรายสถานีอย่างไร
 *     หมุดบอกค่า ณ จุดที่ตั้งเครื่องวัด ซึ่งกระจุกอยู่ตามเมืองใหญ่
 *     กรุงเทพฯ มี 79 หมุดทับกันจนดูเหมือนจุดเดียว ส่วนหลายจังหวัดมีหมุดเดียว
 *     การระบายสีทั้งจังหวัดทำให้เห็นภาพเชิงพื้นที่ว่าภูมิภาคไหนหนักกว่ากัน
 *
 * ข้อจำกัดที่ต้องบอกผู้ใช้
 *     จังหวัดหนึ่งอาจมีสถานีเดียวแต่ระบายสีทั้งจังหวัด
 *     ไม่ได้แปลว่าทุกอำเภอมีค่าเท่ากัน เขียนกำกับไว้ใต้แผนที่แล้ว
 *
 * ทำไมโหลดไฟล์รูปร่างตอนใช้งาน ไม่ฝังไว้ในโค้ด
 *     ไฟล์ใหญ่เกือบห้าแสนไบต์ ถ้าฝังรวมไปกับโค้ดหลัก
 *     คนที่ไม่ได้เปิดโหมดนี้ก็ต้องโหลดตามไปด้วยทุกครั้ง
 */
export function ProvinceLayer({ ranking, selected, onSelect }: Props) {
  const [shapes, setShapes] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/thailand-provinces.geojson");
        const result = (await response.json()) as FeatureCollection;
        if (!cancelled) setShapes(result);
      } catch {
        if (!cancelled) setShapes(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!shapes) return null;

  const byProvince = new Map(ranking.map((row) => [row.province, row]));

  const rowOf = (feature?: Feature<Geometry, unknown>) => {
    const code = (feature?.properties as { code?: string } | undefined)?.code;
    const name = code ? PROVINCE_BY_CODE[code] : undefined;
    return name ? byProvince.get(name) : undefined;
  };

  const nameOf = (feature?: Feature<Geometry, unknown>) => {
    const code = (feature?.properties as { code?: string } | undefined)?.code;
    return code ? PROVINCE_BY_CODE[code] : undefined;
  };

  const styleOf = (feature?: Feature<Geometry, unknown>): PathOptions => {
    const row = rowOf(feature);
    const isPicked = nameOf(feature) === selected;
    return {
      // จังหวัดที่กดเลือกใช้ขอบเข้มหนา ที่เหลือใช้ขอบดำโปร่งบาง ๆ
      // ซึ่งยังทำให้จังหวัดที่สีเดียวกันแยกออกจากกันได้
      //
      // เดิมจังหวัดที่เลือกใช้ขอบขาว ซึ่งใช้ได้ตอนพื้นหลังเป็นสีมืด
      // แต่ขอบขาวบนรูปจังหวัดที่ระบายเหลืองวัดได้ 1.08:1 คือมองไม่เห็นเลย
      // และบนพื้นขาวยิ่งกลืนไปกับพื้นหน้า
      color: isPicked ? "#131a24" : "rgba(0, 0, 0, 0.35)",
      weight: isPicked ? 2.4 : 0.8,
      fillColor: row ? row.level.color : NO_DATA_COLOR,
      // ทึบขึ้นกว่าตอนเป็นธีมมืด
      // ค่าโปร่งบนพื้นมืดทำให้สีเข้มลงซึ่งยังแยกระดับกันออก
      // แต่บนพื้นขาวมันผสมไปทางขาว สีทั้งห้าระดับจึงจางเข้าหากันจนแยกยากขึ้น
      fillOpacity: row ? (isPicked ? 1 : 0.88) : 0.7,
    };
  };

  const attach = (feature: Feature<Geometry, unknown>, layer: Layer) => {
    const code = (feature.properties as { code?: string }).code;
    const name = code ? PROVINCE_BY_CODE[code] : undefined;
    const row = rowOf(feature);

    layer.bindTooltip(
      row
        ? `${name} ${row.pm25_avg} µg/m³ · ระดับ${row.level.label_th} · ${row.station_count} สถานี`
        : `${name ?? "ไม่ทราบจังหวัด"} · ไม่มีสถานีตรวจวัด`,
      { sticky: true },
    );

    const picked = name === selected;

    // เน้นขอบตอนเอาเมาส์ชี้ ให้รู้ว่ากำลังอ่านจังหวัดไหนอยู่
    // ตอนเมาส์ออกต้องคืนค่าตามสถานะที่เลือกไว้ ไม่ใช่คืนเป็นค่าปกติเสมอ
    // ไม่งั้นกรอบของจังหวัดที่กดเลือกจะหายไปเมื่อเอาเมาส์ผ่าน
    layer.on({
      mouseover: () => {
        (layer as Layer & { setStyle: (s: PathOptions) => void }).setStyle({
          weight: 2.4,
          color: "#131a24",
        });
      },
      mouseout: () => {
        (layer as Layer & { setStyle: (s: PathOptions) => void }).setStyle({
          weight: picked ? 2.4 : 0.8,
          color: picked ? "#131a24" : "rgba(0, 0, 0, 0.35)",
        });
      },
      click: () => {
        if (name) onSelect(name);
      },
    });
  };

  // ใส่ key ตามจังหวัดที่เลือก เพื่อบังคับให้วาดชั้นนี้ใหม่เมื่อสลับจังหวัด
  //
  // ชั้น GeoJSON ของ react-leaflet สร้างครั้งเดียวแล้วไม่อ่าน style กับ onEachFeature ซ้ำ
  // ถ้าไม่บังคับ กรอบขาวจะไม่ย้ายตามจังหวัดที่กดใหม่
  return <GeoJSON key={selected ?? "none"} data={shapes} style={styleOf} onEachFeature={attach} />;
}
