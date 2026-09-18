import { useEffect, useState } from "react";

/** โรคประจำตัวที่ผู้ใช้เลือกไว้ เก็บในเครื่องของผู้ใช้เอง */
const KEY = "pm25_my_diseases";

/** ชื่อเหตุการณ์ของตัวเอง ใช้บอกส่วนอื่นในหน้าว่ารายการเปลี่ยนแล้ว
 *
 * เหตุการณ์ storage ของเบราว์เซอร์ส่งถึงเฉพาะแท็บอื่น ไม่ส่งถึงแท็บที่แก้ค่าเอง
 * ถ้าพึ่งตัวนั้นอย่างเดียว กล่องคำแนะนำในหน้าแรกจะไม่อัปเดตตามตอนกดเลือกในหน้าโรค
 */
const CHANGED = "pm25-my-diseases-changed";

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // เบราว์เซอร์บางตัวปิดที่เก็บข้อมูลไว้ ถือว่ายังไม่ได้เลือกโรค
    return [];
  }
}

/** รายชื่อโรคประจำตัวที่เลือกไว้ พร้อมฟังก์ชันสลับเลือก
 *
 * ไม่ส่งขึ้นเซิร์ฟเวอร์ เพราะระบบตั้งใจไม่เก็บข้อมูลสุขภาพรายบุคคลไว้เลย
 */
export function useMyDiseases(): [string[], (name: string) => void] {
  const [names, setNames] = useState<string[]>(read);

  useEffect(() => {
    const sync = () => setNames(read());
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = (name: string) => {
    const next = names.includes(name) ? names.filter((item) => item !== name) : [...names, name];
    setNames(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร ยังใช้ได้จนกว่าจะปิดหน้า
    }
    window.dispatchEvent(new Event(CHANGED));
  };

  return [names, toggle];
}
