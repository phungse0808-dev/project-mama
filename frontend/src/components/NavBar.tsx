import "./NavBar.css";

export type SectionKey = "air" | "advice" | "hiv" | "weather" | "data";

// เมนูของหน้าเนื้อหา แต่ละอันเลื่อนไปยังส่วนที่เกี่ยวข้องในหน้าเดียวกัน
// ไม่ได้เปลี่ยนหน้า เพราะข้อมูลทั้งหมดอยู่หน้าเดียวและผู้ใช้มักดูต่อเนื่องกัน
// การเลื่อนจึงเร็วกว่าและไม่ต้องโหลดใหม่
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "air", label: "วัดคุณภาพอากาศ" },
  { key: "advice", label: "คำแนะนำ" },
  { key: "hiv", label: "HIV" },
  { key: "weather", label: "ข้อมูลอากาศ" },
  { key: "data", label: "คุณภาพข้อมูล" },
];

type Props = {
  active: SectionKey | null;
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
