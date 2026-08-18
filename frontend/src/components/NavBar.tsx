import "./NavBar.css";

export type SectionKey = "air" | "hiv";

// แบ่งเป็นสองหน้าตามเรื่องที่ต่างกันจริง
//   วัดคุณภาพอากาศ  ทุกอย่างที่เกี่ยวกับฝุ่น ตั้งแต่ค่าปัจจุบัน คำแนะนำ ผลกระทบสุขภาพ
//                   สภาพอากาศ ไปจนถึงคุณภาพของข้อมูล เพราะทั้งหมดตอบคำถามเดียวกัน
//                   คือฝุ่นตอนนี้เป็นอย่างไรและควรทำอย่างไร
//   HIV             ข้อมูลคนละชุด คนละแหล่ง คนละคำถาม จึงแยกออกมา
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "air", label: "วัดคุณภาพอากาศ" },
  { key: "hiv", label: "HIV" },
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
