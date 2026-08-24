/**
 * สรุปฝุ่นและอากาศประจำวัน แจ้งผ่านการแจ้งเตือนของเครื่อง
 *
 * ทำงานแบบตามเก็บ ไม่ใช่ตั้งเวลายิงตรงเป๊ะ
 *     แจ้งครั้งเดียวต่อวัน ตอนที่ผู้ใช้เปิดเว็บครั้งแรกหลังเวลาที่ตั้งไว้
 *     ถ้าเปิดเว็บค้างอยู่แล้วตอนถึงเวลา ก็แจ้งตอนนั้นพอดี
 *     เพราะหน้าเว็บดึงข้อมูลใหม่เป็นระยะอยู่แล้ว จึงรู้ตัวเองว่าถึงเวลาแล้ว
 *
 * ทำไมไม่ตั้งเวลายิงตรงเป๊ะอย่างเดียว
 *     การยิงตรงเวลาต้องมีหน้าเว็บเปิดค้างอยู่พอดีตอนนั้น ซึ่งแทบไม่เกิดขึ้นจริง
 *     คนเปิดเว็บตอนไหนก็ได้ ไม่ได้นั่งเฝ้า ถ้าทำแบบนั้นอย่างเดียวจะเงียบเกือบทุกวัน
 *     แบบตามเก็บทำให้ได้สรุปทุกวันที่เปิดเว็บ แลกกับเวลาที่อาจไม่ตรงเป๊ะ
 *     ซึ่งไม่เสียหาย เพราะสิ่งที่ต้องการคือรู้ว่าวันนี้เป็นอย่างไร
 *
 * ไม่ตามไปแจ้งย้อนหลังข้ามวัน
 *     วันไหนไม่ได้เปิดเว็บเลยก็ข้ามไป ค่าฝุ่นของเมื่อวานไม่ช่วยตัดสินใจอะไรแล้ว
 *
 * เก็บค่าไว้ในเครื่องผู้ใช้ ไม่ผูกกับบัญชีและไม่ส่งขึ้นเซิร์ฟเวอร์
 *     เพราะเป็นการตั้งค่าของอุปกรณ์ ไม่ใช่ของคน
 *     คนเดียวกันเปิดคนละเครื่องย่อมอยากได้คนละแบบ
 */

import { api } from "./api";
import type { PersonalSummary, Pm25Forecast, RainChance, WeatherNow } from "./api";

const SETTINGS_KEY = "pm25.digest.settings";
const LAST_SENT_KEY = "pm25.digest.lastSent";

/** ต่างจากค่าปกติเกินกี่องศาถึงเรียกว่าผิดปกติ
 *
 * ใช้ 5 องศา ซึ่งจากข้อมูลย้อนหลังหกปีเกิดขึ้นราวห้าเปอร์เซ็นต์ของวัน
 * คือเดือนละครั้งหรือสองครั้ง ถี่พอจะมีประโยชน์แต่ไม่ถี่จนคนเลิกสนใจ
 */
const UNUSUAL_TEMP_DIFF = 5;

export type DigestSettings = {
  enabled: boolean;
  /** ชั่วโมงที่เริ่มแจ้งได้ ระบบนาฬิกา 24 ชั่วโมง */
  hour: number;
  /** ว่างแปลว่าใช้จังหวัดที่ผู้ใช้ตั้งไว้ในโปรไฟล์ */
  province: string;
};

export const DEFAULT_SETTINGS: DigestSettings = {
  enabled: false,
  hour: 10,
  province: "",
};

export function loadSettings(): DigestSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DigestSettings>) };
  } catch {
    // อ่านไม่ได้แปลว่าค่าที่เก็บไว้เสีย ใช้ค่าตั้งต้นแทนการพังทั้งหน้า
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: DigestSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // เขียนไม่ได้เมื่อผู้ใช้ปิดการเก็บข้อมูลในเบราว์เซอร์ ปล่อยผ่านได้
    // ผลคือการตั้งค่าไม่ถูกจำข้ามการเปิดหน้า ซึ่งไม่ร้ายแรงพอจะแจ้งเตือน
  }
}

/** วันที่วันนี้ในรูป 2026-08-24 ตามเวลาของเครื่องผู้ใช้
 *
 * ไม่ใช้ toISOString เพราะอันนั้นแปลงเป็นเวลามาตรฐานสากลก่อน
 * ซึ่งทำให้ช่วงเช้ามืดของไทยกลายเป็นวันก่อนหน้า แล้วแจ้งซ้ำสองครั้งในวันเดียว
 */
function todayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function alreadySentToday(now: Date): boolean {
  try {
    return localStorage.getItem(LAST_SENT_KEY) === todayKey(now);
  } catch {
    return false;
  }
}

function markSent(now: Date): void {
  try {
    localStorage.setItem(LAST_SENT_KEY, todayKey(now));
  } catch {
    // เขียนไม่ได้ก็ปล่อย ผลคืออาจแจ้งซ้ำถ้าเปิดหน้าใหม่ ซึ่งยอมรับได้
  }
}

/** ล้างวันที่แจ้งล่าสุด ใช้ตอนผู้ใช้เปลี่ยนการตั้งค่า
 *
 * ถ้าไม่ล้าง คนที่เพิ่งเปิดใช้งานตอนบ่ายจะต้องรอถึงพรุ่งนี้กว่าจะได้เห็น
 * ว่าหน้าตาเป็นอย่างไร ซึ่งทำให้ไม่แน่ใจว่าตั้งถูกหรือเปล่า
 */
export function clearLastSent(): void {
  try {
    localStorage.removeItem(LAST_SENT_KEY);
  } catch {
    // ไม่เป็นไร
  }
}

export type PermissionState = "unsupported" | "granted" | "denied" | "default";

export function permissionState(): PermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermissionState;
}

/** ขออนุญาตแจ้งเตือน คืนค่าว่าได้รับอนุญาตหรือไม่
 *
 * เบราว์เซอร์ยอมให้ถามได้ครั้งเดียว ถ้าผู้ใช้กดปฏิเสธไปแล้วจะถามซ้ำไม่ได้อีก
 * ต้องไปเปิดเองในตั้งค่าของเบราว์เซอร์ หน้าเว็บจึงต้องบอกให้ชัดเมื่อเจอกรณีนี้
 */
export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** ปัดเป็นจำนวนเต็ม ใช้กับอุณหภูมิเท่านั้น
 *
 * ทศนิยมของอุณหภูมิไม่ได้ช่วยตัดสินใจอะไร 32.4 กับ 32 องศาให้ทำแบบเดียวกัน
 * ต่างจากค่าฝุ่นที่ 18.3 กับ 18.9 อาจข้ามไปคนละระดับได้ จึงคงทศนิยมไว้
 */
function whole(value: number): string {
  return String(Math.round(value));
}

type DigestSource = {
  province: string;
  forecast: Pm25Forecast | null;
  weather: WeatherNow | null;
  rain: RainChance | null;
  personal: PersonalSummary | null;
};

export type DigestMessage = { title: string; body: string };

/**
 * ประกอบข้อความจากข้อมูลที่มี คืน null เมื่อข้อมูลไม่พอจะบอกอะไรได้
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
 * และเพื่อให้เห็นชัดว่าข้อความที่ผู้ใช้เห็นประกอบขึ้นจากอะไรบ้าง
 */
export function buildMessage(source: DigestSource): DigestMessage | null {
  const { province, forecast, weather, rain, personal } = source;

  const today = forecast?.available ? forecast.days?.find((day) => day.is_today) : undefined;
  const now = weather?.available ? weather : null;

  // ไม่มีทั้งค่าฝุ่นและอุณหภูมิก็ไม่เหลืออะไรให้บอก
  if (!today && !now) return null;

  // หัวเรื่องเก็บเฉพาะตัวเลข เพราะเป็นบรรทัดที่ระบบปฏิบัติการวาดใหญ่และหนาที่สุด
  // ชื่อจังหวัดกับคำอธิบายย้ายลงไปอยู่เนื้อความแทน
  const titleParts: string[] = [];
  if (today) titleParts.push(`ฝุ่น ${today.pm25_avg}`);
  if (now?.temp_min != null && now?.temp_max != null) {
    titleParts.push(`อุณหภูมิ ${whole(now.temp_min)}–${whole(now.temp_max)}°`);
  }

  const lines: string[] = [];

  if (today) {
    const parts = [province, `ระดับ${today.level.label_th}`];
    const days = forecast?.days ?? [];
    const rest = days.filter((day) => !day.is_today);
    if (rest.length > 0) {
      const change = rest[rest.length - 1].pm25_avg - today.pm25_avg;
      // บอกทิศทางเฉพาะตอนที่เปลี่ยนพอสังเกตได้ ต่ำกว่านี้ถือว่าทรงตัว
      if (Math.abs(change) >= 2) parts.push(change > 0 ? "แนวโน้มสูงขึ้น" : "แนวโน้มลดลง");
      else parts.push("แนวโน้มทรงตัว");
    }
    if (forecast?.standard_th != null && today.pm25_avg > forecast.standard_th) {
      parts.push("เกินมาตรฐานไทย");
    }
    lines.push(parts.join(" · "));
  }

  // เทียบอุณหภูมิกับค่าปกติของช่วงวันนี้ของปี
  //
  // ค่าปกติมาจากข้อมูลย้อนหลังของ NASA POWER ส่วนค่าของวันนี้มาจาก Open-Meteo
  // เป็นคนละแหล่งกัน ต้องระบุไว้ในเล่มว่าการเทียบนี้ข้ามแหล่งข้อมูล
  const normalMax = rain?.normal?.temp_max ?? null;
  const normalMin = rain?.normal?.temp_min ?? null;
  if (now?.temp_max != null && now?.temp_min != null) {
    const hotDiff = normalMax != null ? now.temp_max - normalMax : 0;
    const coldDiff = normalMin != null ? normalMin - now.temp_min : 0;

    let note = "ใกล้เคียงปกติ";
    if (hotDiff >= UNUSUAL_TEMP_DIFF) note = `ร้อนกว่าปกติ ${hotDiff.toFixed(1)} องศา`;
    else if (coldDiff >= UNUSUAL_TEMP_DIFF) note = `เย็นกว่าปกติ ${coldDiff.toFixed(1)} องศา`;
    else if (normalMax == null || normalMin == null) note = "";

    if (note) lines.push(`อุณหภูมิ${note}`);

    // คืนที่เย็นผิดปกติทำให้เกิดชั้นอากาศเย็นกดฝุ่นไว้ใกล้พื้น ฝุ่นจึงสะสมมากกว่าปกติ
    // บอกไว้เพราะเป็นเหตุผลว่าทำไมสองเรื่องนี้ถึงมาอยู่ในข้อความเดียวกัน
    if (coldDiff >= UNUSUAL_TEMP_DIFF) lines.push("คืนที่เย็นจัดทำให้ฝุ่นสะสมใกล้พื้น");
  }

  const advice = personal?.my_advice?.advice_th;
  if (advice) lines.push(advice);

  return {
    title: titleParts.length > 0 ? titleParts.join(" · ") : `สรุปวันนี้ · ${province}`,
    body: lines.join("\n"),
  };
}

/** ถึงเวลาที่ควรแจ้งหรือยัง */
export function shouldSend(settings: DigestSettings, now: Date): boolean {
  if (!settings.enabled) return false;
  if (permissionState() !== "granted") return false;
  if (now.getHours() < settings.hour) return false;
  return !alreadySentToday(now);
}

/**
 * ตรวจแล้วแจ้งถ้าถึงเวลา คืนค่าว่าได้แจ้งออกไปหรือไม่
 *
 * เรียกซ้ำได้ปลอดภัย เพราะเช็ควันที่แจ้งล่าสุดก่อนเสมอ
 * จึงเรียกทุกครั้งที่ข้อมูลรีเฟรชได้โดยไม่ต้องกลัวแจ้งซ้ำ
 */
export async function sendIfDue(
  settings: DigestSettings,
  fallbackProvince: string,
  userId: number | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (!shouldSend(settings, now)) return false;

  const province = settings.province || fallbackProvince;
  if (!province) return false;

  // จองสิทธิ์ก่อนไปดึงข้อมูล กันการยิงซ้อนกันเมื่อมีหลายจุดเรียกพร้อมกัน
  // ถ้าดึงข้อมูลล้มเหลวจะคืนสิทธิ์กลับไป ให้รอบถัดไปได้ลองใหม่
  markSent(now);

  try {
    const [forecast, weather, rain, personal] = await Promise.all([
      api.pm25Forecast(province, null).catch(() => null),
      api.weatherNow(province).catch(() => null),
      api.rainChance(province).catch(() => null),
      // คำแนะนำตามกลุ่มเสี่ยงที่ผู้ใช้ตั้งไว้ ถ้ายังไม่ได้เข้าระบบก็ข้ามไป
      // ข้อความยังใช้ได้อยู่ แค่ไม่มีบรรทัดคำแนะนำเฉพาะตัว
      userId != null
        ? api.personalSummary(userId).catch(() => null)
        : Promise.resolve(null as PersonalSummary | null),
    ]);

    const message = buildMessage({ province, forecast, weather, rain, personal });
    if (!message) {
      clearLastSent();
      return false;
    }

    new Notification(message.title, {
      body: message.body,
      icon: "/app-icon.svg",
      badge: "/app-icon.svg",
      // ตั้ง tag ไว้เพื่อให้การแจ้งของวันเดียวกันทับกันแทนที่จะซ้อนกันหลายอัน
      tag: "pm25-daily-digest",
    });
    return true;
  } catch {
    clearLastSent();
    return false;
  }
}
