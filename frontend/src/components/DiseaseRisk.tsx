import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import type {
  DiseaseSummary,
  HealthAdvice,
  Pm25HourlyPoint,
  Summary,
} from "../api";
import { levelInk } from "../levelInk";
import { ProtectIcon } from "./ProtectIcon";

type Props = {
  /** สรุปค่าฝุ่นของพื้นที่ที่เลือกอยู่ ใช้เป็นตัวตั้งในการคำนวณ */
  summary: Summary | null;
  /** แสดงเป็นวงกลมแทนกล่องกับกราฟเส้น ใช้ในหน้าโรคจากฝุ่น
   *
   * หน้าหลักกับหน้าโรคต้องการคนละแบบ
   *     หน้าหลักเป็นทางผ่าน คนกวาดตาแล้วไปต่อ กล่องกับกราฟเส้นตอบได้ว่า
   *     ค่าเท่าไรและวันนี้ช่วงไหนแย่ที่สุด
   *     หน้าโรคเป็นที่อ่านจริง วงกลมตอบได้ว่าฝุ่นดันโรคไหนแรงกว่ากัน
   *     ซึ่งเป็นคำถามที่คนเปิดหน้านี้มาถาม
   */
  ring?: boolean;
  /** แสดงเฉพาะโรคนี้โรคเดียว ค่าว่างแปลว่าแสดงทุกโรค
   *
   * ใช้ชื่อเต็มตามกุญแจในตารางค่าเสี่ยง ไม่ใช่ชื่อย่อที่ตัดคำนำหน้าออกแล้ว
   */
  only?: string;
};

/** สีประจำกลุ่มโรค เรียงตามลำดับที่เซิร์ฟเวอร์ส่งมา
 *
 * ตั้งใจไม่ใช้สีชุดเดียวกับระดับคุณภาพอากาศ
 * เพราะสีชุดนั้นแปลว่าอันตรายมากน้อย ถ้าเอามาใช้กับชื่อโรค
 * คนจะอ่านว่าโรคสีแดงร้ายแรงกว่าโรคสีเขียว ซึ่งไม่ใช่สิ่งที่แผงนี้บอก
 *
 * ชุดเดิมเข้มเท่ากันหมดทั้งเจ็ดสี วงจึงดูหนักและไม่มีสีไหนให้เริ่มอ่าน
 * ชุดนี้อ่อนลงหนึ่งระดับ วงเบาลงโดยยังแยกโรคด้วยสีได้เหมือนเดิม
 *
 * ลำดับในรายการนี้ไม่ใช่ลำดับสวยงาม แต่จัดมาให้สีที่อยู่ติดกันในวงต่างกันมากที่สุด
 * เพราะชิ้นที่อยู่ติดกันคือคู่ที่ตาต้องแยกออกจากกันจริง ๆ
 * สลับลำดับเมื่อไรต้องรันตัวตรวจใหม่ ไม่ใช่แค่ดูว่าสวยอยู่ไหม
 *
 * ตรวจด้วย validate_palette ของสกิล dataviz ผ่านทั้งห้าข้อบนพื้นสว่าง
 *     ความสว่าง ทั้งเจ็ดสีอยู่ในช่วง L 0.43 ถึง 0.77
 *     ความอิ่มสี ทุกสีเกินเกณฑ์ 0.1 ไม่มีสีไหนอ่านเป็นเทา
 *     คู่ติดกันสำหรับตาบอดสี ต่ำสุด 8.9 แบบ deutan และ 6.8 แบบ tritan
 *     คู่ติดกันสำหรับตาปกติ ต่ำสุด 16.2 ซึ่งเกินเกณฑ์ 15
 *     ความต่างจากพื้นขาว ทุกสีเกิน 3:1
 * รวมคู่ที่บรรจบกันคือชิ้นสุดท้ายชนชิ้นแรกแล้ว
 *
 * ค่า tritan 6.8 อยู่ในช่วงที่ใช้ได้เฉพาะเมื่อมีอย่างอื่นช่วยบอกนอกจากสี
 * ซึ่งแผงนี้มีอยู่แล้วคือตารางข้างวงที่เขียนชื่อโรคกับตัวเลขไว้ครบทุกแถว
 * ถ้าวันไหนเอาตารางออก ต้องกลับมาหาสีที่ผ่านเกณฑ์โดยไม่ต้องพึ่งตาราง
 */
/** โรคในวงกลมตรงกับกลุ่มเสี่ยงไหนในตารางคำแนะนำสุขภาพ
 *
 * ทำไมต้องจับคู่ ไม่ใช้คำแนะนำเดียวกันหมด
 *     คำแนะนำของคนเป็นหอบหืดกับคนเป็นโรคหัวใจไม่เหมือนกัน
 *     ระดับเดียวกันคนหนึ่งได้ว่าเตรียมยาพ่น อีกคนได้ว่าสังเกตอาการเหนื่อยง่าย
 *     ถ้าแสดงข้อความกลางเหมือนกันหมด คนที่เลือกโรคตัวเองไว้จะไม่ได้อะไรเพิ่ม
 *
 * ผิวหนังอักเสบกับตาอักเสบไม่มีกลุ่มเสี่ยงของตัวเองในตาราง
 * จึงตกไปใช้ของประชาชนทั่วไป ซึ่งตรงกว่าการยัดเข้ากลุ่มทางเดินหายใจ
 * เพราะสองโรคนี้ไม่ได้เข้าทางปอด และคำแนะนำเรื่องยาพ่นไม่เกี่ยวกับคนเป็นผื่น
 */
const DISEASE_GROUP: Record<string, string> = {
  "โรคภูมิแพ้": "respiratory",
  "โรคหอบหืด": "respiratory",
  "โรคปอดอุดกั้นเรื้อรัง": "respiratory",
  "โรคปอดอักเสบ": "respiratory",
  "กลุ่มโรคหัวใจและหลอดเลือด": "cardiac",
  "กลุ่มโรคผิวหนังอักเสบ": "general",
  "กลุ่มโรคตาอักเสบ": "general",
};

/** ไอคอนของแต่ละกลุ่มเสี่ยง ใช้ชุดเดียวกับแถบวิธีป้องกันในหน้าวัดคุณภาพอากาศ */
const GROUP_ICON: Record<string, string> = {
  respiratory: "wind",
  cardiac: "heart",
  general: "run",
};

const GROUP_COLORS = [
  "#378add",
  "#d85a30",
  "#1d9e75",
  "#7f77dd",
  "#ba7517",
  "#d4537e",
  "#639922",
];

/** รัศมีและเส้นรอบวงของวงกลม ใช้แปลงสัดส่วนเป็นความยาวเส้นประ */
const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** ระยะห่างระหว่างชิ้น หน่วยเดียวกับเส้นรอบวง
 *
 * ต้องมีช่องว่าง ไม่ให้ชิ้นชนกันสนิท เพราะสองชิ้นที่ติดกันโดยไม่มีเส้นคั่น
 * อ่านเป็นชิ้นเดียวเมื่อสีใกล้กัน ต่างจากกล่องที่อยู่ห่างกันอยู่แล้ว
 *
 * กว้างขึ้นจาก 2 เป็น 4 พร้อมกับเปลี่ยนไปใช้สีที่อ่อนลง
 * ช่องขาวที่กว้างขึ้นทำให้แต่ละชิ้นแยกจากกันด้วยตัวมันเอง ไม่ต้องพึ่งสีเข้มช่วย
 */
const SLICE_GAP = 4;

/** เกณฑ์ที่ใช้เทียบ ตรงกับค่าใน backend/app/health_advice.py
 *
 * ถ้าที่นั่นแก้ ต้องแก้ตรงนี้ด้วย ไม่งั้นข้อความจะขัดกับหน้าคำแนะนำ
 */
const WHO_GUIDELINE = 15;
const THAI_STANDARD = 37.5;

/**
 * จำนวนผู้เข้ารักษามากกว่าวันอากาศสะอาดกี่เปอร์เซ็นต์ เมื่อฝุ่นเท่านี้
 *
 * เป็นสูตรมาตรฐานของการประเมินผลกระทบสุขภาพ
 * คือเอาความเสี่ยงสัมพัทธ์ยกกำลังตามจำนวนช่วงสิบหน่วยที่ค่าฝุ่นสูงขึ้น
 */
function excessPct(pm25: number, rrPer10: number): number {
  return (Math.pow(rrPer10, pm25 / 10) - 1) * 100;
}

/**
 * เอาค่าฝุ่นที่วัดได้มาคำนวณว่าแต่ละกลุ่มโรคมีคนเข้ารักษาเพิ่มขึ้นกี่เปอร์เซ็นต์
 *
 * ตัวเลขนี้แปลว่าอะไร
 *     จำนวนครั้งที่คนในพื้นที่เข้ารักษา มากกว่าวันที่อากาศสะอาดกี่เปอร์เซ็นต์
 *     ไม่ใช่โอกาสที่คนคนหนึ่งจะป่วย สองอย่างนี้คนละเรื่องกัน
 *     ข้อมูลที่มีเก็บเฉพาะคนที่มาหาหมอ ไม่ได้นับคนที่อยู่บ้านแล้วไม่ป่วย
 *     จึงไม่มีตัวหารสำหรับคำนวณโอกาสของคนคนหนึ่ง
 *
 * ค่าที่ใช้คูณมาจากไหน
 *     จากงานวิจัยที่ตีพิมพ์แล้ว ไม่ได้คำนวณจากข้อมูลของระบบนี้
 *     เพราะช่วงเวลาของข้อมูลผู้ป่วยกับค่าฝุ่นที่เก็บได้ไม่ทับกันเลยสักวัน
 *     แต่ละกลุ่มโรคมาจากคนละงาน น้ำหนักหลักฐานจึงไม่เท่ากัน
 *     แผงนี้เขียนที่มากำกับไว้ทุกแถว ไม่ยุบรวมเป็นตัวเลขชุดเดียวกัน
 *
 * ทำไมกราฟใช้แกนเวลา
 *     ให้เป็นชนิดเดียวกับกราฟย้อนหลังที่เว็บมีอยู่แล้ว คนใช้จึงอ่านเป็นทันที
 *     และตอบได้ว่าวันนี้ช่วงไหนแย่ที่สุด ซึ่งกราฟที่ลากตามค่าฝุ่นตอบไม่ได้
 */
export function DiseaseRisk({ summary, ring = false, only = "" }: Props) {
  const [data, setData] = useState<DiseaseSummary | null>(null);
  const [hourly, setHourly] = useState<Pm25HourlyPoint[]>([]);
  const [advice, setAdvice] = useState<HealthAdvice | null>(null);
  const province = summary?.province ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.disease();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ดึงใหม่ทุกครั้งที่เปลี่ยนพื้นที่ กราฟจึงเป็นของจังหวัดที่เลือกเสมอ
  //
  // ข้ามไปเลยเมื่อแสดงเป็นวงกลม เพราะวงกลมใช้ค่าเฉลี่ยค่าเดียว ไม่ได้ใช้รายชั่วโมง
  // ถ้าไม่ข้าม หน้าโรคจะยิงคำขอที่ไม่มีใครใช้ผลลัพธ์ทุกครั้งที่เปลี่ยนจังหวัด
  useEffect(() => {
    if (ring) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.pm25Hourly(province, 24);
        if (!cancelled) setHourly(result);
      } catch {
        if (!cancelled) setHourly([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province, ring]);

  // คำแนะนำสุขภาพของพื้นที่ที่เลือก ดึงใหม่เมื่อเปลี่ยนพื้นที่
  //
  // เรียกเฉพาะตอนแสดงเป็นวงกลม เพราะแถบนี้มีเฉพาะหน้าโรค
  // หน้าหลักที่ใช้กล่องกับกราฟเส้นมีแถบวิธีป้องกันของตัวเองอยู่แล้วในการ์ดฝุ่น
  useEffect(() => {
    if (!ring) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.healthAdvice(province);
        if (!cancelled) setAdvice(result);
      } catch {
        // ไม่มีคำแนะนำก็แค่ไม่ขึ้นแถบ ส่วนอื่นของแผงยังใช้ได้ตามปกติ
        if (!cancelled) setAdvice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [province, ring]);

  const riskTable = data?.risk_by_group;
  const current = summary?.pm25_avg ?? null;
  if (!riskTable || current == null) return null;

  // เรียงตามผลของค่าฝุ่นจากมากไปน้อย ไม่ใช่ตามลำดับที่เซิร์ฟเวอร์ส่งมา
  //
  // สาระของแผงคือค่าฝุ่นเท่านี้กระทบโรคไหนมากที่สุด
  // การเรียงตามผลลัพธ์จึงตอบคำถามได้ทันที ไม่ต้องไล่อ่านเทียบทีละแถว
  // กรองก่อนแจกสี ไม่ใช่หลังแจกสี
  //
  // ถ้ากรองทีหลัง โรคที่เหลือจะได้สีตามลำดับใหม่ ทำให้สีเปลี่ยนไปมาเมื่อสลับตัวเลือก
  // สีต้องผูกกับโรค ไม่ใช่ผูกกับอันดับที่มันอยู่ในรายการ
  const allRows = Object.entries(riskTable)
    .map(([group, risk], index) => ({
      group,
      // ตัดคำนำหน้าออกให้เหลือแต่ชื่อโรค กล่องจะได้แคบลงและชื่อเรียงกันสม่ำเสมอ
      // ต้องตัดทั้ง "กลุ่มโรค" และ "โรค" เพราะรายการในตารางใช้คำนำหน้าไม่เหมือนกัน
      // บางตัวเป็นกลุ่มโรคตามที่กรมควบคุมโรคเรียก บางตัวเป็นโรคเดี่ยวจากงานวิจัย
      short: group.replace(/^(กลุ่มโรค|โรค)/, ""),
      risk,
      color: GROUP_COLORS[index % GROUP_COLORS.length],
      pct: excessPct(current, risk.relative_risk_per_10),
    }))
    .sort((a, b) => b.pct - a.pct);

  const rows = allRows.filter((row) => !only || row.group === only);

  // ผลรวมคิดจากทุกโรคเสมอ ไม่ใช่จากโรคที่เหลือหลังกรอง
  //
  // เพราะสัดส่วนที่แสดงต้องแปลว่า "ส่วนแบ่งของโรคนี้ในผลทั้งหมดที่ฝุ่นก่อ"
  // ถ้าหารด้วยผลรวมของโรคที่เลือกไว้ โรคเดียวจะได้ 100% เสมอ ซึ่งไม่จริง
  // และพอสลับโรค ตัวเลขสัดส่วนจะเป็น 100% เท่ากันหมดจนเทียบอะไรไม่ได้เลย
  //
  // ตัวผลรวมเองไม่เอาไปแสดงที่ไหน เพราะแต่ละเปอร์เซ็นต์วัดจากฐานคนละฐาน
  // บวกกันแล้วไม่มีความหมาย ใช้เป็นตัวหารอย่างเดียว
  const totalPct = allRows.reduce((sum, row) => sum + row.pct, 0) || 1;

  // โรคที่เจาะดูอยู่ ค่าว่างแปลว่าดูทุกโรค
  //
  // ใช้ตัดสินแค่สองอย่างคือวงวาดแบบไหน กับจะโชว์ที่มาของตัวเลขไหม
  // ส่วนหัวข้อกับตารางยังอยู่ที่เดิมทั้งคู่ไม่ว่าเลือกอะไร
  // เดิมสองอย่างนั้นหายไปตอนเลือกโรค ทำให้กดทีเดียวแล้วทั้งแผงดูเหมือนคนละแผง
  // ทั้งที่ควรรู้สึกว่าแค่เจาะดูใกล้ขึ้น ไม่ใช่ย้ายไปอยู่หน้าอื่น
  const picked = ring && only && rows.length === 1 ? rows[0] : null;

  // กลุ่มคำแนะนำที่ต้องแสดง คิดจากโรคที่กำลังดูอยู่
  //
  // ดูทุกโรคจะได้สามกลุ่ม เพราะเจ็ดโรคยุบลงมาเหลือคำแนะนำสามชุดที่ไม่ซ้ำกัน
  // ถ้าเรียงทีละโรคจะได้ข้อความเดียวกันซ้ำสี่บรรทัด เพราะสี่โรคใช้กลุ่มเดียวกัน
  // จับกลุ่มแล้วติดป้ายชื่อโรคกำกับ ได้ครบเจ็ดโรคเท่าเดิมแต่อ่านสั้นกว่า
  //
  // เลือกโรคเดียวจะเหลือกลุ่มเดียวที่ตรงกับโรคนั้น
  const adviceGroups = (() => {
    if (!advice) return [];
    const wanted = picked ? [picked] : allRows;
    const order: string[] = [];
    const members: Record<string, string[]> = {};
    for (const row of wanted) {
      const key = DISEASE_GROUP[row.group] ?? "general";
      if (!members[key]) {
        members[key] = [];
        order.push(key);
      }
      members[key].push(row.short);
    }
    return order
      .map((key) => {
        const group = advice.groups.find((item) => item.key === key);
        return group ? { ...group, diseases: members[key] } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  })();

  let cursor = 0;
  const slices = allRows.map((row) => {
    const share = row.pct / totalPct;
    const length = share * CIRCUMFERENCE;
    const slice = {
      ...row,
      share,
      dash: `${Math.max(0, length - SLICE_GAP)} ${CIRCUMFERENCE - length + SLICE_GAP}`,
      offset: -cursor,
    };
    cursor += length;
    return slice;
  });

  // แปลงค่าฝุ่นรายชั่วโมงเป็นเปอร์เซ็นต์ของทุกกลุ่มโรคในจุดเดียวกัน
  // ใช้ชื่อย่อเป็นกุญแจ เพราะเป็นชื่อเดียวกับที่แสดงในคำอธิบายสีของกราฟ
  const series = hourly.map((point) => {
    const row: Record<string, number | string> = { label: point.label, pm25: point.pm25 };
    for (const item of rows) {
      row[item.short] = Number(excessPct(point.pm25, item.risk.relative_risk_per_10).toFixed(2));
    }
    return row;
  });

  // เทียบกับเกณฑ์ที่เข้มกว่าก่อน ผู้อ่านจะได้รู้ตัวตั้งแต่ยังไม่เกินมาตรฐานไทย
  const standing =
    current > THAI_STANDARD
      ? "เกินมาตรฐานของไทย"
      : current > WHO_GUIDELINE
        ? "เกินคำแนะนำขององค์การอนามัยโลก"
        : "อยู่ในคำแนะนำขององค์การอนามัยโลก";

  return (
    <section className="panel drisk">
      <h2 className="panel-title">
        โรคที่มากับฝุ่น
        <span className="panel-hint">เอาค่าฝุ่นที่วัดได้มาคำนวณ</span>
      </h2>

      {/* บรรทัดนี้ทำให้ตัวตั้งกับผลลัพธ์อยู่ในกล่องเดียวกัน
          ผู้อ่านไม่ต้องเงยกลับขึ้นไปดูการ์ดข้างบนว่าตอนนี้ฝุ่นเท่าไหร่ */}
      <div className="drisk-source-value">
        <span className="drisk-scope">
          ฝุ่นที่วัดได้{province ? `ใน${province}` : "ทั้งประเทศ"}
        </span>
        <span className="drisk-pm">{current}</span>
        {summary?.level && (
          <>
            <span className="drisk-level-dot" style={{ background: summary.level.color }} />
            <span className="drisk-level">ระดับ{summary.level.label_th}</span>
          </>
        )}
        <span className="drisk-standing">
          {summary?.stations_reporting ? `${summary.stations_reporting} สถานี · ` : ""}
          {standing}
        </span>
      </div>

      {/* คำเตือนวางก่อนตัวเลข ไม่ใช่ท้ายแผง
          เพราะคำเตือนที่อยู่ท้ายแผงถูกอ่านหลังจากเข้าใจผิดไปเรียบร้อยแล้ว

          บรรทัดแรกมาจาก risk_note_th ที่ฝั่งหลังบ้านเตรียมไว้ตั้งแต่ต้น
          ส่งมากับคำตอบทุกครั้งแต่ไม่เคยมีหน้าไหนหยิบมาแสดง */}
      {ring && (
        <div className="drisk-warn">
          <p>
            <strong>
              ตัวเลขนี้คือจำนวนผู้เข้ารักษาทั้งพื้นที่ ไม่ใช่โอกาสป่วยของคุณ
            </strong>
          </p>
          <p>
            คำนวณจากค่าฝุ่นที่วัดได้ คูณกับความเสี่ยงสัมพัทธ์จากงานวิจัยต่างประเทศ
            ไม่ได้มาจากผู้ป่วยจริงในไทย
          </p>
        </div>
      )}

      {ring ? (
        <>
          {/* หัวข้อนี้อยู่ตลอด ไม่ว่าเลือกทุกโรคหรือเจาะดูโรคเดียว
              เพราะเป็นคำอธิบายว่าวงกลมข้างล่างอ่านยังไง ซึ่งจริงทั้งสองกรณี */}
          <p className="drisk-section">
            ฝุ่นวันนี้ดันโรคไหนแรงที่สุด
            <span>ชิ้นใหญ่แปลว่าฝุ่นดันโรคนั้นแรงกว่า ไม่ใช่ว่ามีคนป่วยเยอะกว่า</span>
          </p>

          <div className="drisk-ring-row">
            <svg
              className="drisk-ring"
              viewBox="0 0 180 180"
              role="img"
              aria-label={
                picked
                  ? `ส่วนแบ่งผลของฝุ่นต่อ${picked.short}`
                  : "สัดส่วนผลของฝุ่นต่อแต่ละโรค"
              }
            >
              <g transform="rotate(-90 90 90)" fill="none" strokeWidth="26">
                {picked ? (
                  <>
                    {/* รางสีเทาคืออีกหกโรคที่ไม่ได้เลือก ไม่ใช่ที่ว่างเปล่า ๆ
                        ตารางข้าง ๆ บอกว่าหกโรคนั้นคือโรคอะไรบ้าง */}
                    <circle cx="90" cy="90" r={RADIUS} stroke="var(--surface-2)" />
                    <circle
                      cx="90"
                      cy="90"
                      r={RADIUS}
                      stroke={picked.color}
                      strokeLinecap="round"
                      strokeDasharray={`${(picked.pct / totalPct) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                    />
                  </>
                ) : (
                  slices.map((slice) => (
                    <circle
                      key={slice.group}
                      cx="90"
                      cy="90"
                      r={RADIUS}
                      stroke={slice.color}
                      strokeDasharray={slice.dash}
                      strokeDashoffset={slice.offset}
                    />
                  ))
                )}
              </g>

              {/* ดูทุกโรคใส่ค่าฝุ่นไว้ตรงกลาง ไม่ใช่ผลรวมของทุกชิ้น
                  เพราะเปอร์เซ็นต์ของแต่ละโรควัดจากฐานคนละฐาน บวกกันแล้วไม่มีความหมาย
                  ถ้าใส่ผลรวมไว้ตรงกลางจะเป็นตัวเลขที่ผิด

                  เจาะดูโรคเดียวจึงใส่ค่าของโรคนั้นแทน ซึ่งเป็นตัวเลขที่มีความหมายจริง */}
              {picked ? (
                <>
                  <text className="drisk-ring-value" x="90" y="80" textAnchor="middle">
                    +{picked.pct.toFixed(2)}%
                  </text>
                  <text className="drisk-ring-unit" x="90" y="97" textAnchor="middle">
                    {picked.short}
                  </text>
                  <text className="drisk-ring-unit" x="90" y="112" textAnchor="middle">
                    {((picked.pct / totalPct) * 100).toFixed(1)}% ของผลรวม
                  </text>
                </>
              ) : (
                <>
                  <text className="drisk-ring-value" x="90" y="84" textAnchor="middle">
                    {current}
                  </text>
                  <text className="drisk-ring-unit" x="90" y="104" textAnchor="middle">
                    µg/m³ ที่วัดได้
                  </text>
                </>
              )}
            </svg>

            {/* ตารางข้างวงเก็บค่าจริงของทุกโรคไว้ครบ
                วงกลมบอกได้แค่ว่าชิ้นไหนใหญ่กว่า แต่บอกไม่ได้ว่าเท่าไร
                ถ้ามีแต่วงอย่างเดียว ตัวเลขที่เป็นสาระจะหายไป

                แสดงครบเจ็ดแถวเสมอ แม้ตอนเจาะดูโรคเดียว
                เพราะค่าของโรคหนึ่งไม่มีความหมายถ้าไม่รู้ว่าโรคอื่นเท่าไร
                และการที่แถวไม่หายไปไหนทำให้กดสลับแล้วสายตาไม่ต้องหาที่อยู่ใหม่ */}
            <ul className="drisk-legend">
              <li className="drisk-legend-head">
                <span />
                <span>โรค</span>
                <span>เพิ่มขึ้น</span>
                <span>สัดส่วน</span>
              </li>
              {slices.map((slice) => {
                const isPicked = picked?.group === slice.group;
                return (
                  <li
                    key={slice.group}
                    className={picked ? (isPicked ? "on" : "off") : undefined}
                  >
                    {/* แถวที่ไม่ได้เลือกใช้จุดสีเทา ไม่ใช่สีของโรคที่จางลง
                        เพราะสีจางของเจ็ดโรคยังแยกออกจากกันได้อยู่ แล้วจะแย่งความสนใจ
                        กับแถวที่เลือกไว้ กลายเป็นไฮไลต์ที่ไม่ได้ไฮไลต์อะไร */}
                    <span
                      className="drisk-legend-dot"
                      style={{ background: picked && !isPicked ? "var(--border-strong)" : slice.color }}
                    />
                    <span className="drisk-legend-name">
                      {slice.short}
                      {slice.risk.uncertain && <em>*</em>}
                    </span>
                    <span className="drisk-legend-pct">+{slice.pct.toFixed(2)}%</span>
                    <span className="drisk-legend-share">{(slice.share * 100).toFixed(1)}%</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ที่มาของตัวเลขโผล่ขึ้นมาต่อท้าย ไม่ได้ไปแทนที่ตาราง
              จึงกางได้ครบเพราะมีโรคเดียว ต่างจากตอนดูเจ็ดโรคที่ยาวเกินจะใส่ทุกแถว */}
          {picked && (
            <div className="drisk-pick">
              <p className="drisk-pick-head">
                <span className="drisk-legend-dot" style={{ background: picked.color }} />
                ที่มาของตัวเลข{picked.short}
              </p>
              <dl className="drisk-pick-facts">
                <div>
                  <dt>ความเสี่ยงสัมพัทธ์ต่อฝุ่น 10 หน่วย</dt>
                  <dd>{picked.risk.relative_risk_per_10}</dd>
                </div>
                <div>
                  <dt>ช่วงความเชื่อมั่น</dt>
                  <dd>
                    {picked.risk.ci_low}–{picked.risk.ci_high}
                  </dd>
                </div>
                <div>
                  <dt>ฝุ่นที่ใช้คำนวณ</dt>
                  <dd>{current} µg/m³</dd>
                </div>
              </dl>
              <p className="drisk-pick-note">
                {picked.risk.outcome_th} · {picked.risk.source_th} · {picked.risk.evidence_th}
                {picked.risk.uncertain &&
                  " · ช่วงความเชื่อมั่นคร่อมเลขหนึ่ง ผลยังไม่ชัดเจนทางสถิติ"}
              </p>
            </div>
          )}

          {/* เดิมเขียนว่าดอกจันคือช่วงความเชื่อมั่นคร่อมเลขหนึ่ง ซึ่งไม่จริง
              ตรวจทั้งเจ็ดโรคแล้วไม่มีโรคไหนคร่อมเลยสักโรค รวมทั้งภูมิแพ้ที่ติดดอกจันอยู่
              ช่วงของมันคือ 1.008 ถึง 1.413 ซึ่งอยู่เหนือหนึ่งทั้งช่วง
              เหตุผลจริงคืองานทบทวนรวมไม่พบนัยสำคัญ หลักฐานจึงขัดกันเอง

              คำว่าส่วนแบ่งเปลี่ยนด้วย เพราะทำให้คนคิดว่ามีก้อนหนึ่งอยู่แล้วแบ่งกัน
              ซึ่งไม่มี ตัวหารเกิดจากการบวกเปอร์เซ็นต์ที่วัดจากฐานคนละฐาน
              ตัวมันเองจึงไม่มีความหมาย บอกได้แค่ความแรงเมื่อเทียบกันเอง */}
          <p className="drisk-ring-note">
            เครื่องหมายดอกจันคือกลุ่มที่งานวิจัยยังให้ผลไม่ตรงกัน ตัวเลขจึงยังสรุปไม่ได้แน่ ·
            คอลัมน์เพิ่มขึ้นคือค่าจริงของโรคนั้น ส่วนคอลัมน์สัดส่วนคือความแรงเมื่อเทียบกันเองในวงกลม
          </p>

          {/* แถบวิธีป้องกัน เปลี่ยนทั้งข้อความและสีตามค่าฝุ่นที่วัดได้

              ทำไมต้องมี
                  ของเดิมแผงนี้บอกได้แค่ว่าฝุ่นดันโรคไหนแรงกว่ากัน ซึ่งรู้แล้วทำอะไรต่อไม่ได้
                  แถบนี้ทำให้อ่านจบแล้วมีสิ่งที่ลงมือทำได้จริง และเชื่อมสองส่วนของหน้าเข้าด้วยกัน
                  คือเลือกโรคที่ตัวเองเป็น แล้วได้คำแนะนำของโรคนั้นเลย

              สีขอบซ้ายใช้สีมาตรฐานของระดับ ส่วนไอคอนใช้เฉดเข้มจาก levelInk
              เพราะเหลือง #ffd400 บนพื้นขาววัดได้ 1.43:1 ซึ่งอ่านไม่ออก
              ส่วนขอบซ้ายเป็นพื้นสี ไม่ได้อยู่ใต้เกณฑ์เดียวกับตัวอักษร */}
          {adviceGroups.length > 0 && advice?.level && (
            <div
              className="drisk-advice"
              style={{ boxShadow: `inset 4px 0 0 ${advice.level.color}` }}
            >
              <p className="drisk-advice-head">ฝุ่นระดับนี้ ใครต้องระวังอะไร</p>
              <p className="drisk-advice-sub">
                {picked
                  ? `แสดงเฉพาะกลุ่มที่ ${picked.short} อยู่`
                  : "ครอบคลุมทั้ง 7 โรคในวงกลม จับกลุ่มตามชนิดของผลกระทบ"}
              </p>

              {/* ข้อปฏิบัติทั่วไปของระดับนี้ วางไว้บนสุดเพราะใช้กับทุกคน
                  ไม่ต้องอ่านว่าตัวเองอยู่กลุ่มไหนก่อนถึงจะรู้ว่าต้องทำอะไร
                  ส่วนบรรทัดของแต่ละกลุ่มข้างล่างคือส่วนที่ต่างกันตามโรค

                  ใช้ summary.protection ที่มากับค่าสรุปอยู่แล้ว ไม่ได้ขอเพิ่ม
                  ค่านี้กับระดับที่ใช้ตัดสินสีจึงมาจากคำตอบเดียวกันเสมอ
                  ไม่มีจังหวะที่ค่าเปลี่ยนแล้วคำแนะนำยังเป็นของระดับเดิมค้างอยู่ */}
              {summary && summary.protection.length > 0 && (
                <div className="drisk-advice-basic">
                  {summary.protection.map((item) => (
                    <span key={item.text_th}>
                      <ProtectIcon
                        name={item.icon}
                        color={levelInk(advice.level.color) ?? "currentColor"}
                        size={19}
                      />
                      {item.text_th}
                    </span>
                  ))}
                </div>
              )}

              <ul className="drisk-advice-list">
                {adviceGroups.map((group) => (
                  <li key={group.key}>
                    <ProtectIcon
                      name={GROUP_ICON[group.key] ?? "heart"}
                      color={levelInk(advice.level.color) ?? "currentColor"}
                      size={21}
                    />
                    <div>
                      <p className="drisk-advice-group">{group.label_th}</p>
                      {/* ป้ายชื่อโรคบอกว่าบรรทัดนี้ครอบคลุมโรคไหนบ้าง
                          ถ้าไม่มี คนอ่านจะไม่รู้ว่ากลุ่มทางเดินหายใจหมายถึงสี่โรคไหนในวงกลม */}
                      <p className="drisk-advice-chips">
                        {group.diseases.map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </p>
                      <p className="drisk-advice-text">{group.advice_th}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </>
      ) : (
        <>
      <p className="drisk-section">คนเข้ารักษาเพิ่มขึ้น เทียบกับวันอากาศสะอาด</p>

      <div className="drisk-tiles">
        {rows.map((row) => (
          <div
            key={row.group}
            className="drisk-tile"
            style={{ borderTopColor: row.color, borderTopStyle: row.risk.uncertain ? "dashed" : "solid" }}
          >
            <p className="drisk-tile-value" style={{ color: row.color }}>
              +{row.pct.toFixed(2)}
              <span className="drisk-tile-unit">%</span>
            </p>
            <p className="drisk-tile-name">{row.short}</p>
          </div>
        ))}
      </div>

      {series.length >= 2 && (
        <div className="chart">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
              {/* พื้นไล่สีใต้เส้น ชุดเดียวกับกราฟย้อนหลังของสถานี
                  ให้ทั้งเว็บใช้ภาษาภาพเดียวกัน ไม่ใช่ต่างหน้าต่างสไตล์ */}
              <defs>
                {rows.map((row, index) => (
                  <linearGradient
                    key={row.group}
                    id={`driskFill${index}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={row.color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={row.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ebf1" />
              <XAxis dataKey="label" tick={{ fontSize: 14.5 }} />
              <YAxis tick={{ fontSize: 14.5 }} unit="%" width={77} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "#ccd6e0",
                  background: "#ffffff",
                  color: "#131a24",
                  fontSize: 15.5,
                }}
                labelFormatter={(label) => `เวลา ${label}`}
                formatter={(value, name) => [`+${value}%`, name]}
              />
              <Legend />
              {rows.map((row, index) => (
                <Area
                  key={row.group}
                  type="monotone"
                  dataKey={row.short}
                  name={row.short}
                  stroke={row.color}
                  strokeWidth={2}
                  // เส้นประบอกว่าผลของกลุ่มนี้ยังไม่ชัดเจนทางสถิติ
                  // ใช้สัญลักษณ์เดียวกับขีดบนกล่องตัวเลขข้างบน
                  strokeDasharray={row.risk.uncertain ? "6 4" : undefined}
                  fill={`url(#driskFill${index})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
        </>
      )}

    </section>
  );
}
