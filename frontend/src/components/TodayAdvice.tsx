import type { StationSummary, Summary, WeatherNow } from "../api";
import { levelInk } from "../levelInk";
import { ProtectIcon } from "./ProtectIcon";
import { WeatherIcon } from "./WeatherIcon";

type Props = {
  summary: Summary;
  /** ค่าของสถานีที่เจาะดู ว่างแปลว่าดูทั้งจังหวัดหรือทั้งประเทศ */
  stationSummary: StationSummary | null;
  weatherNow: WeatherNow | null;
  weatherProvince: string;
};

/** โอกาสฝนตกวันนี้ตั้งแต่ค่านี้ แนะนำให้พกร่มแม้ตอนนี้ฝนยังไม่ตก */
const RAIN_CHANCE_UMBRELLA = 60;

/** อุณหภูมิสูงสุดของวันตั้งแต่ค่านี้ ถือว่าร้อน */
const HOT_MAX_C = 35;

/** อุณหภูมิต่ำสุดของวันไม่เกินค่านี้ ถือว่าหนาว */
const COLD_MIN_C = 20;

/** รหัสสภาพอากาศของ WMO ที่เป็นฝนทุกแบบ ฝนละออง ฝนตก ฝนซู่ และพายุฝนฟ้าคะนอง */
function isRainCode(code: number | null | undefined): boolean {
  if (code == null) return false;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

/** ชื่อฤดูตามช่วงของกรมอุตุนิยมวิทยา
 *
 * ฤดูร้อน 16 ก.พ.–15 พ.ค. · ฤดูฝน 16 พ.ค.–15 ต.ค. · ฤดูหนาว 16 ต.ค.–15 ก.พ.
 * ใช้แค่เป็นป้ายบอกฤดู คำแนะนำดูจากอากาศจริงของวันนั้น ไม่ได้ดูจากชื่อฤดู
 */
function thaiSeason(day: Date): string {
  const md = (day.getMonth() + 1) * 100 + day.getDate();
  if (md >= 216 && md <= 515) return "ฤดูร้อน";
  if (md >= 516 && md <= 1015) return "ฤดูฝน";
  return "ฤดูหนาว";
}

type WeatherTip = { icon: number; text: string; why?: string };

/** กล่องคำแนะนำวันนี้ ใต้การ์ดฝุ่นกับสภาพอากาศในหน้าแรก
 *
 * ฝั่งฝุ่นใช้คำแนะนำการป้องกันตามระดับที่เซิร์ฟเวอร์ส่งมากับค่าสรุป
 * ฝั่งอากาศบอกว่าควรพกอะไร ขึ้นได้หลายข้อพร้อมกัน
 *     ตอนนี้เป็นฝนแบบไหนก็ได้ เครื่องวัดฝนวัดได้ หรือโอกาสฝนวันนี้ตั้งแต่ 60% → พกร่มและเสื้อกันฝน
 *     ร้อนสุดวันนี้ตั้งแต่ 35°C → พกหมวกหรือร่มกันแดด และดื่มน้ำบ่อย ๆ
 *     ต่ำสุดวันนี้ไม่เกิน 20°C → พกเสื้อกันหนาว
 *     ไม่เข้าข้อไหนเลย → อากาศปกติ
 * เกณฑ์ 60% 35°C 20°C ตั้งเองให้อ่านง่าย ไม่ได้อ้างเกณฑ์ของกรมอุตุนิยมวิทยา
 */
export function TodayAdvice({ summary, stationSummary, weatherNow, weatherProvince }: Props) {
  const level = stationSummary ? stationSummary.level : summary.level;
  const pm25 = stationSummary ? stationSummary.pm25 : summary.pm25_avg;
  const protection = stationSummary ? stationSummary.protection : summary.protection;
  const scope = stationSummary ? stationSummary.name_th : summary.province ?? "ทั้งประเทศ";

  const now = weatherNow?.available ? weatherNow : null;
  const tips: WeatherTip[] = [];
  if (now) {
    const rainingNow = isRainCode(now.weather_code) || Boolean(now.condition_measured);
    const chance = now.rain_chance_pct ?? null;
    const chanceText = chance != null ? `โอกาสฝนตกวันนี้ ${chance}%` : "ไม่มีข้อมูลโอกาสฝน";
    if (rainingNow || (chance != null && chance >= RAIN_CHANCE_UMBRELLA)) {
      tips.push({
        icon: 61,
        text: "ควรพกร่มหรือเสื้อกันฝนไว้ในกระเป๋า",
        why: rainingNow
          ? `ตอนนี้${now.condition}${now.condition_measured ? " ตามเครื่องวัดฝน" : ""} · ${chanceText}`
          : `ตอนนี้${now.condition} แต่${chanceText}`,
      });
    }
    if (now.temp_max != null && now.temp_max >= HOT_MAX_C) {
      tips.push({ icon: 0, text: "ควรพกหมวกหรือร่มกันแดดไว้ในกระเป๋า", why: `ร้อนสุดวันนี้ ${now.temp_max}°C` });
      tips.push({ icon: 0, text: "ดื่มน้ำบ่อย ๆ" });
    }
    if (now.temp_min != null && now.temp_min <= COLD_MIN_C) {
      tips.push({ icon: 3, text: "ควรพกเสื้อกันหนาวไว้ในกระเป๋า", why: `ต่ำสุดวันนี้ ${now.temp_min}°C` });
    }
    if (tips.length === 0) {
      tips.push({
        icon: 2,
        text: "อากาศปกติ ไม่ต้องพกอะไรเพิ่ม",
        why: `ตอนนี้${now.condition} · ${chanceText}`,
      });
    }
  }

  return (
    <section className="advice">
      <h2 className="advice-title">คำแนะนำวันนี้</h2>
      <div className="advice-cols">
        <div className="advice-col">
          <p className="advice-col-head">
            <span
              className="advice-dot"
              style={{ background: level?.color ?? "var(--text-dim)" }}
              aria-hidden="true"
            />
            เรื่องฝุ่น · {scope}
            {level ? ` · ${level.label_th}` : ""}
            {pm25 != null ? ` ${pm25}` : ""}
          </p>
          {protection.length > 0 ? (
            <ul className="advice-list">
              {protection.map((item) => (
                <li key={item.text_th}>
                  <ProtectIcon name={item.icon} color={levelInk(level?.color) ?? "currentColor"} />
                  <span>{item.text_th}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="advice-why">ยังไม่มีคำแนะนำ เพราะไม่มีค่าฝุ่นล่าสุด</p>
          )}
        </div>

        <div className="advice-col">
          <p className="advice-col-head">
            เรื่องสภาพอากาศ · {weatherProvince} · {thaiSeason(new Date())}
          </p>
          {now ? (
            <ul className="advice-list">
              {tips.map((tip) => (
                <li key={tip.text}>
                  {/* ใช้ไอคอนสภาพอากาศที่มีอยู่แล้ว ฝน แดด เมฆ แทนการวาดร่มหรือเสื้อใหม่ */}
                  <WeatherIcon code={tip.icon} size={22} />
                  <span>
                    {tip.text}
                    {tip.why && <span className="advice-why">{tip.why}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="advice-why">ยังไม่มีข้อมูลสภาพอากาศ</p>
          )}
        </div>
      </div>
    </section>
  );
}
