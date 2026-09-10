import { AppIcon } from "./AppIcon";
import { NotificationBell } from "./NotificationBell";
import "./NavBar.css";

// "home" ไม่มีปุ่มในเมนู เพราะเข้าถึงได้จากการเข้าระบบและปุ่มกลับอยู่แล้ว
// ใส่ปุ่มซ้ำอีกจะรกโดยไม่ได้เพิ่มทางเข้าใหม่
export type SectionKey = "home" | "air" | "disease";

// ปุ่มเมนูของหน้าเนื้อหา
//
// แยกเรื่องโรคออกมาเป็นหน้าของตัวเอง เพราะตอบคนละคำถามกับหน้าวัดคุณภาพอากาศ
//     วัดคุณภาพอากาศ  ตอนนี้อากาศเป็นอย่างไร ที่ไหนแย่ แนวโน้มเป็นอย่างไร
//     โรคจากฝุ่น       ค่าฝุ่นเท่านี้กระทบสุขภาพอย่างไร และคนป่วยจริงเท่าไร
//
// และเพราะหน้าโรคมีข้อมูลผู้ป่วยจริงจากกรมควบคุมโรคที่ระบบดึงมาแล้ว
// แต่ยังไม่เคยได้แสดงเลย ซึ่งใหญ่เกินกว่าจะยัดไว้ท้ายหน้าอื่น
//
// หน้าหลักไม่มีปุ่มในเมนู เพราะเข้าถึงได้จากการเข้าระบบและปุ่มกลับอยู่แล้ว
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "air", label: "วัดคุณภาพอากาศ" },
  { key: "disease", label: "โรคจากฝุ่น" },
];

type Props = {
  active: SectionKey;
  onGoTo: (key: SectionKey) => void;
  onSearch: () => void;
  onHome: () => void;
  onSignOut: () => void;
  provinces: string[];
  /** จังหวัดในโปรไฟล์ ส่งต่อให้สรุปประจำวันในแผงระฆัง */
  fallbackProvince: string;
  /** โหมดสีที่ใช้อยู่ */
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

export function NavBar({
  active,
  onGoTo,
  onSearch,
  onHome,
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

        {/* ปุ่มเลือกหน้าโชว์ตลอด ไม่ใช่เฉพาะตอนอยู่หน้าหลัก
            เดิมซ่อนตอนเข้าหน้าเนื้อหา ซึ่งใช้ได้ตอนมีหน้าเดียวเพราะไม่มีที่ให้สลับไป
            พอมีสองหน้าแล้ว การสลับต้องกดกลับหน้าหลักก่อนหนึ่งครั้งเสมอ
            ทั้งที่ปุ่มของอีกหน้าควรอยู่ตรงนั้นให้กดได้เลย

            หน้าที่อยู่ตอนนี้ทำเป็นปุ่มเน้น เพื่อบอกตำแหน่งโดยไม่ต้องอ่านเนื้อหา */}
        <nav className="navbar-menu">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              className={active === item.key ? "navbar-item active" : "navbar-item"}
              onClick={() => onGoTo(item.key)}
              aria-current={active === item.key ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="navbar-right">
          {/* ระฆังอยู่ก่อนปุ่มอื่น เพราะเป็นสิ่งที่ต้องเหลือบดูว่ามีอะไรใหม่ไหม
              ไม่ใช่ปุ่มที่ตั้งใจจะกด การวางไว้ซ้ายสุดของกลุ่มทำให้เจอง่ายกว่า */}
          <NotificationBell provinces={provinces} fallbackProvince={fallbackProvince} />
          <button className="navbar-action" onClick={onSearch}>
            ค้นหา
          </button>

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
          {/* ปุ่มขวาสุดเปลี่ยนตามหน้าที่อยู่
              อยู่หน้าเนื้อหา ปุ่มพากลับหน้าหลัก
              อยู่หน้าหลักแล้ว ไม่มีที่ให้กลับ ปุ่มจึงเป็นออกจากระบบ
              เปลี่ยนชื่อไปด้วยเพื่อให้ตรงกับสิ่งที่กดแล้วจะเกิดขึ้นจริง */}
          {active === "home" ? (
            <button className="navbar-action" onClick={onSignOut}>
              ออกจากระบบ
            </button>
          ) : (
            <button className="navbar-action" onClick={onHome}>
              กลับ
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
