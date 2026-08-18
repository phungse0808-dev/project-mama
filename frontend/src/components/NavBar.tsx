import "./NavBar.css";

// "home" ไม่มีปุ่มในเมนู เพราะเข้าถึงได้จากการเข้าระบบและปุ่มกลับอยู่แล้ว
// ใส่ปุ่มซ้ำอีกจะรกโดยไม่ได้เพิ่มทางเข้าใหม่
export type SectionKey = "home" | "air" | "hiv";

// แบ่งเป็นสองหน้าตามเรื่องที่ต่างกันจริง
//   วัดคุณภาพอากาศ  ทุกอย่างที่เกี่ยวกับฝุ่น ตั้งแต่ค่าปัจจุบัน คำแนะนำ ผลกระทบสุขภาพ
//                   สภาพอากาศ ไปจนถึงคุณภาพของข้อมูล เพราะทั้งหมดตอบคำถามเดียวกัน
//                   คือฝุ่นตอนนี้เป็นอย่างไรและควรทำอย่างไร
//   HIV             ข้อมูลคนละชุด คนละแหล่ง คนละคำถาม จึงแยกออกมา
// ตอนนี้ยังไม่มีปุ่มเมนู กำลังจัดแถบใหม่
//
// หน้าวัดคุณภาพอากาศกับหน้า HIV ยังอยู่ครบในโค้ด แค่ยังไม่มีทางกดเข้าไป
// เติมกลับเมื่อไรก็ได้ด้วยการใส่รายการลงในตัวแปรนี้ ไม่ต้องแก้ที่อื่น
export const SECTIONS: { key: SectionKey; label: string }[] = [];

type Props = {
  active: SectionKey;
  onGoTo: (key: SectionKey) => void;
  onSearch: () => void;
  onBack: () => void;
};

export function NavBar({ active, onGoTo, onSearch, onBack }: Props) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-logo" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <nav className="navbar-menu">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              className={item.key === active ? "navbar-item active" : "navbar-item"}
              onClick={() => onGoTo(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="navbar-right">
          <button className="navbar-action" onClick={onSearch}>
            ค้นหา
          </button>
          <button className="navbar-action" onClick={onBack}>
            กลับ
          </button>
        </div>
      </div>
    </header>
  );
}
