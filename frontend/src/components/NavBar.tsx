import "./NavBar.css";

export type SectionKey = "air" | "disease" | "hiv" | "blank1" | "blank2";

// แบ่งเป็นสองหน้าตามเรื่องที่ต่างกันจริง
//   วัดคุณภาพอากาศ  ทุกอย่างที่เกี่ยวกับฝุ่น ตั้งแต่ค่าปัจจุบัน คำแนะนำ ผลกระทบสุขภาพ
//                   สภาพอากาศ ไปจนถึงคุณภาพของข้อมูล เพราะทั้งหมดตอบคำถามเดียวกัน
//                   คือฝุ่นตอนนี้เป็นอย่างไรและควรทำอย่างไร
//   HIV             ข้อมูลคนละชุด คนละแหล่ง คนละคำถาม จึงแยกออกมา
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "air", label: "วัดคุณภาพอากาศ" },
  { key: "disease", label: "ผลกระทบสุขภาพ" },
  { key: "hiv", label: "HIV" },
  // หน้าที่กันที่ไว้ ยังไม่ได้กำหนดว่าจะใส่อะไร
  // เข้าไปได้จริงและเป็นหน้าว่าง ไม่ใช่ปุ่มที่กดไม่ลง
  // เพื่อให้เห็นโครงของระบบครบตั้งแต่ตอนนี้ แล้วค่อยเติมเนื้อหาทีหลัง
  { key: "blank1", label: "หน้า 4" },
  { key: "blank2", label: "หน้า 5" },
];


type Props = {
  active: SectionKey;
  onGoTo: (key: SectionKey) => void;
  onSearch: () => void;
  onSignOut: () => void;
};

export function NavBar({ active, onGoTo, onSearch, onSignOut }: Props) {
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
          <button className="navbar-action" onClick={onSignOut}>
            กลับ
          </button>
        </div>
      </div>
    </header>
  );
}
