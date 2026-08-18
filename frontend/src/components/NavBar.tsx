import "./NavBar.css";

export type SectionKey = "overview" | "data";

// รวมเนื้อหาทั้งหมดไว้เพียงสองหน้า แบ่งตามคำถามที่ผู้ใช้ต้องการคำตอบ
//   ภาพรวม        ตอนนี้อากาศเป็นอย่างไร และฉันควรปฏิบัติตัวอย่างไร
//   ข้อมูลเชิงลึก  ย้อนหลังเป็นอย่างไร และข้อมูลชุดนี้เชื่อถือได้แค่ไหน
//
// รายการนี้ยังใช้อยู่ที่หน้าแรก ซึ่งเป็นจุดที่ผู้ใช้เลือกว่าจะเข้าดูหน้าไหน
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview", label: "ภาพรวม" },
  { key: "data", label: "ข้อมูลเชิงลึก" },
];

type Props = {
  onHome: () => void;
};

/**
 * แถบด้านบนของหน้าเนื้อหา
 *
 * มีเพียงโลโก้กับปุ่มกลับ ไม่มีเมนูและไม่มีปุ่มอื่น เพื่อไม่ให้แย่งความสนใจ
 * ไปจากข้อมูลซึ่งเป็นสาระหลักของหน้า การเลือกว่าจะดูหน้าไหน
 * ทำที่หน้าแรกไปแล้วก่อนเข้ามา
 */
export function NavBar({ onHome }: Props) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button
          className="navbar-logo"
          onClick={onHome}
          title="กลับหน้าแรก"
          aria-label="กลับหน้าแรก"
        >
          <span />
          <span />
          <span />
        </button>

        <div className="navbar-right">
          <button className="navbar-action" onClick={onHome}>
            กลับ
          </button>
        </div>
      </div>
    </header>
  );
}
