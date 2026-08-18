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

// ช่องเมนูที่กันที่ไว้ตามแบบ ยังไม่ได้กำหนดว่าจะเป็นหน้าอะไร
//
// ทำเป็นปุ่มที่กดไม่ได้จริงๆ ไม่ใช่ปุ่มที่กดแล้วไม่เกิดอะไรขึ้น
// เพราะปุ่มที่ดูกดได้แต่เงียบ ทำให้ผู้ใช้คิดว่าระบบพัง
// ส่วนปุ่มที่จางและกดไม่ลง สื่อชัดว่ายังไม่เปิดใช้งาน
const PLACEHOLDER_COUNT = 3;

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

          {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
            <button
              key={`ยังไม่ได้กำหนด-${index}`}
              className="navbar-item navbar-item-empty"
              disabled
              title="ยังไม่ได้กำหนดว่าเป็นหน้าอะไร"
            >
              &nbsp;
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
