/**
 * แปลงข้อมูลที่ระบบมีอยู่แล้วให้กลายเป็นรายการแจ้งเตือน
 *
 * ไม่ได้สร้างข้อมูลใหม่ แค่หยิบสิ่งที่หน้าเว็บดึงมาอยู่แล้วมาบันทึกไว้
 * ให้ย้อนดูได้ จึงไม่ต้องเพิ่มอะไรที่หลังบ้านเลย
 */

import { add } from "./notificationLog";
import type { NoticeLevel } from "./notificationLog";
import type { Alerts, Pm25Forecast, WeatherNow } from "./api";

/** ย่อเวลาให้เหลือระดับชั่วโมง ใช้เป็นส่วนหนึ่งของ id เพื่อกันบันทึกซ้ำ
 *
 * ข้อมูลต้นทางออกเป็นรายชั่วโมง แต่หน้าเว็บดึงซ้ำทุกห้านาที
 * ถ้าใช้เวลาที่ดึงเป็น id เรื่องเดียวกันจะถูกบันทึกสิบสองครั้งต่อชั่วโมง
 * การย่อเหลือชั่วโมงทำให้ทุกรอบในชั่วโมงเดียวกันได้ id เดียวกัน
 */
function hourKey(iso: string): string {
  return iso.slice(0, 13);
}

/**
 * บันทึกสถานการณ์ฝุ่นเกินเกณฑ์ของชั่วโมงล่าสุด
 *
 * บันทึกเฉพาะตอนที่มีสถานีเกินจริง ถ้าไม่มีเลยก็ไม่ต้องบอกอะไร
 * เพราะรายการที่เต็มไปด้วยข่าวดีทำให้คนเลิกเปิดดู
 */
export function recordAlerts(alerts: Alerts | null): void {
  if (!alerts) return;

  const overThai = alerts.over_thai_standard ?? [];
  const overWho = alerts.over_who_guideline ?? [];
  if (overWho.length === 0) return;

  // ใช้เวลาที่ตรวจเป็นฐานของ id เพราะเป็นตัวเดียวที่บอกได้ว่านี่คือข้อมูลรอบไหน
  const key = hourKey(alerts.checked_at);

  // เกินมาตรฐานไทยเป็นเรื่องที่หนักกว่า จึงแยกเป็นคนละรายการ
  // ไม่รวมกับรายการเกินคำแนะนำ WHO ซึ่งเกิดเป็นปกติทุกวัน
  if (overThai.length > 0) {
    const worst = overThai[0];
    add({
      id: `alert-thai-${key}`,
      level: "unhealthy",
      title: `${overThai.length} สถานีเกินมาตรฐานไทย`,
      detail: `สูงสุดที่${worst.name_th} จ.${worst.province} ${worst.pm25} µg/m³ ${worst.level.label_th}`,
      at: alerts.checked_at,
    });
    return;
  }

  const worst = overWho[0];
  // ระดับสีตามสถานีที่แย่ที่สุด ไม่ใช่สีตายตัว
  // เพื่อให้สีของระฆังสะท้อนความรุนแรงจริงตั้งแต่ยังไม่กดเข้าไปดู
  const level: NoticeLevel = worst.level?.key === "moderate" ? "moderate" : "info";

  add({
    id: `alert-who-${key}`,
    level,
    title: `${overWho.length} สถานีเกินคำแนะนำ WHO`,
    detail: `สูงสุดที่${worst.name_th} จ.${worst.province} ${worst.pm25} µg/m³ ${worst.level.label_th}`,
    at: alerts.checked_at,
  });
}

/**
 * บันทึกสรุปประจำวัน ใช้เนื้อหาชุดเดียวกับที่เด้งขึ้นมา
 *
 * บันทึกแม้ผู้ใช้ไม่ได้อนุญาตให้แจ้งเตือน เพราะระฆังไม่ต้องขออนุญาต
 * คนที่ปฏิเสธคำขอแจ้งเตือนจึงยังได้สรุปประจำวันผ่านระฆัง
 */
export function recordDigest(
  province: string,
  forecast: Pm25Forecast | null,
  weather: WeatherNow | null,
  at: Date = new Date(),
): void {
  const today = forecast?.available ? forecast.days?.find((day) => day.is_today) : undefined;
  const now = weather?.available ? weather : null;
  if (!today && !now) return;

  const parts: string[] = [];
  if (today) parts.push(`ฝุ่น ${today.pm25_avg} µg/m³ ระดับ${today.level.label_th}`);
  if (now?.temp_min != null && now?.temp_max != null) {
    parts.push(`อุณหภูมิ ${Math.round(now.temp_min)}–${Math.round(now.temp_max)}°`);
  }

  const overStandard =
    today != null && forecast?.standard_th != null && today.pm25_avg > forecast.standard_th;

  const dateKey = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

  add(
    {
      id: `digest-${dateKey}-${province}`,
      level: overStandard ? "unhealthy" : "good",
      title: `สรุปวันนี้ · ${province}`,
      detail: parts.join(" · "),
      at: at.toISOString(),
    },
    at,
  );
}
