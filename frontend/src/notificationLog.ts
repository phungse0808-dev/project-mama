/**
 * รายการแจ้งเตือนที่เก็บไว้ให้ย้อนดูได้ในเว็บ
 *
 * ต่างจากการแจ้งเตือนที่เด้งขึ้นมา ซึ่งพลาดตอนนั้นแล้วหายไปเลย
 * และต้องขออนุญาตจากเบราว์เซอร์ก่อนซึ่งคนส่วนใหญ่กดปฏิเสธ
 * รายการนี้ไม่ต้องขออนุญาตอะไร ทุกคนเห็นได้ทันที
 *
 * สองอย่างนี้เสริมกัน ตัวที่เด้งสะกิดให้รู้ตอนนั้น ตัวนี้เก็บไว้ให้ย้อนดู
 *
 * เก็บในเครื่องผู้ใช้ ไม่ต้องเพิ่มตารางในฐานข้อมูลและไม่ต้องแตะหลังบ้าน
 * เพราะเป็นบันทึกว่าอุปกรณ์เครื่องนี้เคยเห็นอะไรไปแล้วบ้าง ไม่ใช่ข้อมูลของระบบ
 */

const KEY = "pm25.notifications";

/** เก็บย้อนหลังกี่วัน
 *
 * เจ็ดวันพอให้ย้อนดูว่าสัปดาห์นี้มีวันไหนแย่บ้าง
 * นานกว่านี้ไม่ได้ช่วยตัดสินใจแล้ว และมีกราฟย้อนหลังให้ดูอยู่แล้ว
 */
const KEEP_DAYS = 7;

/** จำนวนรายการสูงสุด กันไม่ให้พื้นที่เก็บบวมเมื่อมีวันที่เตือนถี่ผิดปกติ */
const MAX_ITEMS = 60;

export type NoticeLevel = "info" | "good" | "moderate" | "unhealthy";

export type Notice = {
  /** ใช้กันบันทึกซ้ำ เรื่องเดียวกันจากการดึงข้อมูลคนละรอบต้องได้ id เดียวกัน */
  id: string;
  level: NoticeLevel;
  title: string;
  detail: string;
  /** เวลาที่เกิดเรื่อง ไม่ใช่เวลาที่บันทึก */
  at: string;
  read: boolean;
};

export const LEVEL_COLORS: Record<NoticeLevel, string> = {
  info: "#5ec8ff",
  good: "#7dd8a0",
  moderate: "#ffd400",
  unhealthy: "#ff7e00",
};

/** ลำดับความแรง ใช้เลือกสีของระฆังจากรายการที่แรงที่สุด */
const SEVERITY: NoticeLevel[] = ["good", "info", "moderate", "unhealthy"];

function read(): Notice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as Notice[];
    return Array.isArray(items) ? items : [];
  } catch {
    // ค่าที่เก็บไว้เสีย เริ่มใหม่ดีกว่าปล่อยให้หน้าเว็บพัง
    return [];
  }
}

function write(items: Notice[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // เขียนไม่ได้เมื่อผู้ใช้ปิดการเก็บข้อมูล ผลคือรายการไม่ถูกจำข้ามการเปิดหน้า
  }
}

/** ตัดรายการที่เก่าเกินและที่เกินจำนวนสูงสุดออก */
function prune(items: Notice[], now: Date): Notice[] {
  const cutoff = now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  return items
    .filter((item) => new Date(item.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, MAX_ITEMS);
}

export function list(now: Date = new Date()): Notice[] {
  return prune(read(), now);
}

/** สีของระฆัง เลือกจากรายการที่ยังไม่ได้อ่านที่แรงที่สุด
 *
 * คืน null เมื่ออ่านหมดแล้ว ให้ระฆังเป็นสีจาง
 * ทำให้เห็นความรุนแรงได้ตั้งแต่ยังไม่กดเข้าไปดู
 */
export function worstOf(items: Notice[]): NoticeLevel | null {
  const unread = items.filter((item) => !item.read);
  if (unread.length === 0) return null;
  return unread.reduce<NoticeLevel>(
    (worst, item) => (SEVERITY.indexOf(item.level) > SEVERITY.indexOf(worst) ? item.level : worst),
    unread[0].level,
  );
}

/**
 * บันทึกรายการใหม่ ข้ามถ้ามี id นี้อยู่แล้ว
 *
 * การกันซ้ำด้วย id สำคัญมาก เพราะหน้าเว็บดึงข้อมูลใหม่ทุกห้านาที
 * ถ้าไม่กัน เรื่องเดียวกันจะถูกบันทึกซ้ำสิบสองครั้งต่อชั่วโมง
 *
 * คืนค่าว่าได้บันทึกจริงหรือไม่
 */
export function add(notice: Omit<Notice, "read">, now: Date = new Date()): boolean {
  const items = read();
  if (items.some((item) => item.id === notice.id)) return false;
  write(prune([{ ...notice, read: false }, ...items], now));
  return true;
}

export function markAllRead(now: Date = new Date()): Notice[] {
  const items = list(now).map((item) => ({ ...item, read: true }));
  write(items);
  return items;
}
