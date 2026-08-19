import { AppIcon } from "./AppIcon";
import "./NavBar.css";

// "home" ไม่มีปุ่มในเมนู เพราะเข้าถึงได้จากการเข้าระบบและปุ่มกลับอยู่แล้ว
// ใส่ปุ่มซ้ำอีกจะรกโดยไม่ได้เพิ่มทางเข้าใหม่
export type SectionKey = "home" | "air" | "hiv";

// แบ่งเป็นสองหน้าตามเรื่องที่ต่างกันจริง
//   วัดคุณภาพอากาศ  ทุกอย่างที่เกี่ยวกับฝุ่น ตั้งแต่ค่าปัจจุบัน คำแนะนำ ผลกระทบสุขภาพ
//                   สภาพอากาศ ไปจนถึงคุณภาพของข้อมูล เพราะทั้งหมดตอบคำถามเดียวกัน
//                   คือฝุ่นตอนนี้เป็นอย่างไรและควรทำอย่างไร
//   HIV             ข้อมูลคนละชุด คนละแหล่ง คนละคำถาม จึงแยกออกมา
// ปุ่มเมนูของหน้าเนื้อหา
//
// หน้าหลักไม่มีปุ่มในเมนู เพราะเข้าถึงได้จากการเข้าระบบและปุ่มกลับอยู่แล้ว
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "air", label: "วัดคุณภาพอากาศ" },
  { key: "hiv", label: "HIV" },
];

type Props = {
  active: SectionKey;
  onGoTo: (key: SectionKey) => void;
  onSearch: () => void;
  onHome: () => void;
  onSignOut: () => void;
};

export function NavBar({ active, onGoTo, onSearch, onHome, onSignOut }: Props) {
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

        {/* ปุ่มเลือกหน้าโชว์เฉพาะตอนอยู่หน้าหลัก
            พอเข้าไปในหน้าเนื้อหาแล้วซ่อน เพื่อให้แถบด้านบนไม่แย่งความสนใจ
            ไปจากข้อมูลซึ่งเป็นสาระของหน้า การสลับหน้าทำที่หน้าหลักที่เดียว
            คือกดกลับออกมาแล้วเลือกใหม่ */}
        {active === "home" && (
          <nav className="navbar-menu">
            {SECTIONS.map((item) => (
              <button
                key={item.key}
                className="navbar-item"
                onClick={() => onGoTo(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className="navbar-right">
          <button className="navbar-action" onClick={onSearch}>
            ค้นหา
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
