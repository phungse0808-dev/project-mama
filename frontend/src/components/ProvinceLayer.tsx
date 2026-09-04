import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ProvinceRank } from "../api";
import { PROVINCE_BY_CODE } from "../provinceCodes";

type Props = {
  ranking: ProvinceRank[];
};

/** สีของจังหวัดที่ไม่มีสถานีตรวจวัด
 *
 * ใช้เทาจาง ไม่ใช่สีของระดับใดระดับหนึ่ง เพราะเราไม่รู้ค่าของจังหวัดนั้นจริง ๆ
 * ถ้าระบายเป็นสีฟ้าเหมือนระดับดีมาก คนจะเข้าใจว่าอากาศที่นั่นสะอาด
 * ทั้งที่ความจริงคือไม่มีใครวัด
 */
const NO_DATA_COLOR = "#3a4757";

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
export function ProvinceLayer({ ranking }: Props) {
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

  const styleOf = (feature?: Feature<Geometry, unknown>): PathOptions => {
    const row = rowOf(feature);
    return {
      // เส้นขอบสีพื้นหลัง ทำให้จังหวัดที่สีเดียวกันยังแยกออกจากกันได้
      color: "#0a0e14",
      weight: 0.8,
      fillColor: row ? row.level.color : NO_DATA_COLOR,
      fillOpacity: row ? 0.72 : 0.3,
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

    // เน้นขอบตอนเอาเมาส์ชี้ ให้รู้ว่ากำลังอ่านจังหวัดไหนอยู่
    layer.on({
      mouseover: () => {
        (layer as Layer & { setStyle: (s: PathOptions) => void }).setStyle({
          weight: 2,
          color: "#eaf6ff",
        });
      },
      mouseout: () => {
        (layer as Layer & { setStyle: (s: PathOptions) => void }).setStyle({
          weight: 0.8,
          color: "#0a0e14",
        });
      },
    });
  };

  return <GeoJSON data={shapes} style={styleOf} onEachFeature={attach} />;
}
