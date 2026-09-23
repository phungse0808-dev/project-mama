import type { ProvinceRank, StationReading } from "../api";
import { AppIcon } from "./AppIcon";
import { SearchBox } from "./SearchBox";
import { NotificationBell } from "./NotificationBell";
import "./NavBar.css";

/** หัวข้อทั้งหมดของเว็บ ทุกเรื่องอยู่ในแถบเดียวทางขวาของหน้า
 *
 * เดิมแยกเป็นปุ่มเมนูด้านบนสามหน้า แล้วมีแถบหัวข้ออีกชุดในหน้าแรก
 * ของเดียวกันจึงมีสองที่ให้กด ต้องคอยทำให้สองที่เน้นตรงกัน พลาดเมื่อไรดูเหมือนเว็บพัง
 * ตอนนี้เหลือที่กดที่เดียว แถบบนเหลือแค่โลโก้กับปุ่มเครื่องมือ
 */
export type AirTab =
  | "overview"
  | "map"
  | "ranking"
  | "alerts"
  | "rain"
  | "history"
  | "disease"
  | "data"
  | "forecast"
  | "impact";

/** กลุ่มของหัวข้อ demo เป็นจริงเมื่อทั้งกลุ่มเป็นส่วนสาธิต จะได้แยกกล่องคนละสี
 *
 * แยกด้วยสีแทนการเขียนคำว่าเดโมต่อท้ายทุกปุ่ม อ่านสะอาดกว่าและเห็นได้ในแวบเดียว
 * ว่าส่วนไหนของระบบใช้งานได้จริงแล้ว ส่วนไหนยังเป็นการสาธิต
 */
export const TAB_GROUPS: {
  title: string;
  note?: string;
  demo?: boolean;
  items: { key: AirTab; label: string }[];
}[] = [
  {
    title: "ฝุ่นและอากาศ",
    items: [
      { key: "overview", label: "ภาพรวมตอนนี้" },
      { key: "map", label: "แผนที่" },
      { key: "ranking", label: "อันดับจังหวัด" },
      { key: "alerts", label: "แจ้งเตือนพื้นที่เสี่ยง" },
      { key: "rain", label: "โอกาสฝนตก" },
      { key: "history", label: "อากาศย้อนหลัง" },
    ],
  },
  {
    title: "สุขภาพ",
    items: [{ key: "disease", label: "คำแนะนำตามโรค" }],
  },
  {
    title: "ข้อมูลของระบบ",
    items: [{ key: "data", label: "คุณภาพข้อมูล" }],
  },
  {
    title: "ส่วนสาธิต",
    note: "ยังใช้จริงไม่ได้",
    demo: true,
    items: [
      { key: "forecast", label: "พยากรณ์ฝุ่น" },
      { key: "impact", label: "ฝุ่นกับผู้ป่วย" },
    ],
  },
];

type Props = {
  onHome: () => void;
  /** ข้อมูลที่ช่องค้นหาใช้หา ส่งมาจากที่เดียวกับที่หน้าอื่นใช้ จะได้ไม่ต้องโหลดซ้ำ */
  stations: StationReading[];
  ranking: ProvinceRank[];
  onPickStation: (stationCode: string) => void;
  onPickProvince: (province: string) => void;
  onSignOut: () => void;
  provinces: string[];
  /** จังหวัดในโปรไฟล์ ส่งต่อให้สรุปประจำวันในแผงระฆัง */
  fallbackProvince: string;
  /** โหมดสีที่ใช้อยู่ */
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function NavBar({
  onHome,
  stations,
  ranking,
  onPickStation,
  onPickProvince,
  onSignOut,
  provinces,
  fallbackProvince,
  theme,
  onToggleTheme,
}: Props) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button
          className="navbar-logo"
          onClick={onHome}
          title="กลับหน้าหลัก"
          aria-label="กลับหน้าหลัก"
        >
          <AppIcon size={44} />
        </button>


        {/* ช่องค้นหาอยู่กลางแถบ เห็นตลอดเวลา พิมพ์ได้เลยโดยไม่ต้องกดเปิดก่อน */}
        <SearchBox
          stations={stations}
          ranking={ranking}
          onPickStation={onPickStation}
          onPickProvince={onPickProvince}
        />

        <div className="navbar-right">
          {/* ระฆังอยู่ก่อนปุ่มอื่น เพราะเป็นสิ่งที่ต้องเหลือบดูว่ามีอะไรใหม่ไหม
              ไม่ใช่ปุ่มที่ตั้งใจจะกด การวางไว้ซ้ายสุดของกลุ่มทำให้เจอง่ายกว่า */}
          <NotificationBell provinces={provinces} fallbackProvince={fallbackProvince} />

          {/* ปุ่มสลับโหมดสี
              ข้อความบอกโหมดที่จะได้เมื่อกด ไม่ใช่โหมดที่อยู่ตอนนี้
              เพราะปุ่มควรบอกผลของการกด ไม่ใช่บอกสถานะซึ่งเห็นจากหน้าจออยู่แล้ว

              มีข้อความกำกับเหมือนปุ่มอื่นในแถบนี้ ไม่ใช้ไอคอนเปล่า
              ถ้าใส่ไอคอนเดี่ยวตัวเดียวท่ามกลางปุ่มที่มีข้อความหมด จะดูแปลกแยก
              และผู้ใช้ต้องเดาความหมายของรูป */}
          <button
            className="navbar-action navbar-theme"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {theme === "dark" ? (
                <>
                  <circle cx="12" cy="12" r="4.4" />
                  <path d="M12 2.6v2.4M12 19v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.6 12h2.4M19 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
                </>
              ) : (
                <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
              )}
            </svg>
            {theme === "dark" ? "สว่าง" : "มืด"}
          </button>
          {/* ทั้งเว็บเหลือหน้าเดียว ไม่มีที่ให้กลับ ปุ่มขวาสุดจึงเป็นออกจากระบบเสมอ
              ส่วนปุ่มโลโก้ยังพากลับไปหัวข้อภาพรวมเหมือนเดิม */}
          <button className="navbar-action" onClick={onSignOut}>
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
