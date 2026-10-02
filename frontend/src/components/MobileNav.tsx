import { useEffect, useState, type ReactNode } from "react";
import { TAB_GROUPS, type AirTab } from "./NavBar";
import "./MobileNav.css";

/** หัวข้อที่อยู่บนแถบล่าง เรียงตามลำดับที่แสดง
 *
 * เลือกสี่หัวข้อที่คนเปิดดูบ่อยที่สุดมาไว้บนแถบ ที่เหลือไปอยู่ใต้ปุ่มอื่น ๆ
 * สี่อันเพราะช่องที่ห้าต้องเก็บไว้ให้ปุ่มอื่น ๆ และเกินห้าช่องบนจอ 375px
 * ตัวอักษรใต้ไอคอนจะเล็กจนอ่านไม่ออก
 *
 * ป้ายบนแถบสั้นกว่าชื่อหัวข้อจริงได้ เพราะความกว้างต่อช่องมีแค่ราวเจ็ดสิบพิกเซล
 * เช่น สุขภาพ ใช้แทน คำแนะนำตามโรค
 */
const BAR_TABS: { key: AirTab; label: string; icon: ReactNode }[] = [
  {
    key: "overview",
    label: "ภาพรวม",
    icon: (
      <>
        <path d="M4 15a8 8 0 0 1 16 0" />
        <path d="M12 15 16 10" />
        <circle cx="12" cy="15" r="1.3" />
      </>
    ),
  },
  {
    key: "map",
    label: "แผนที่",
    icon: (
      <>
        <path d="M12 21s6-5.3 6-10a6 6 0 0 0-12 0c0 4.7 6 10 6 10z" />
        <circle cx="12" cy="11" r="2.1" />
      </>
    ),
  },
  {
    key: "ranking",
    label: "อันดับ",
    icon: (
      <>
        <path d="M6 20V12" />
        <path d="M12 20V5" />
        <path d="M18 20v-6" />
      </>
    ),
  },
  {
    key: "disease",
    label: "สุขภาพ",
    icon: <path d="M12 20s-7-4.6-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.4 12 20 12 20z" />,
  },
];

const BAR_KEYS = new Set<AirTab>(BAR_TABS.map((item) => item.key));

type Props = {
  active: AirTab;
  onPick: (tab: AirTab) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSignOut: () => void;
};

/** แถบหัวข้อด้านล่างจอ สำหรับมือถือเท่านั้น
 *
 * จอกว้างยังใช้แถบด้านขวาเหมือนเดิม ไฟล์ CSS เป็นตัวสลับว่าจะโชว์อันไหน
 *
 * ทำไมต้องอยู่ล่าง
 *     เดิมหัวข้อทั้งหมดเป็นกล่องสี่กล่องวางเหนือเนื้อหา กินพื้นที่เกือบครึ่งจอ
 *     คนเปิดมาดูค่าฝุ่นต้องเลื่อนผ่านเมนูก่อนทุกครั้ง และบนมือถือจอใหญ่
 *     เมนูที่อยู่บนสุดกดด้วยนิ้วโป้งข้างเดียวไม่ถึง
 */
export function MobileNav({ active, onPick, theme, onToggleTheme, onSignOut }: Props) {
  const [open, setOpen] = useState(false);

  // ปิดแผ่นเมื่อกดปุ่มย้อนกลับของเครื่อง แทนที่จะออกจากเว็บไปเลย
  // ซึ่งเป็นพฤติกรรมที่คนใช้มือถือคาดหวังจากแผ่นที่เลื่อนขึ้นมา
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    window.history.pushState({ sheet: true }, "");
    return () => {
      window.removeEventListener("popstate", close);
      if (window.history.state?.sheet) window.history.back();
    };
  }, [open]);

  const pick = (tab: AirTab) => {
    setOpen(false);
    onPick(tab);
  };

  // หัวข้อที่ไม่ได้อยู่บนแถบ ยังจัดกลุ่มเหมือนแถบด้านขวาของจอใหญ่
  // เพื่อให้คนที่เคยใช้บนคอมแล้วมาเปิดบนมือถือเจอของในที่เดียวกัน
  const rest = TAB_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !BAR_KEYS.has(item.key)),
  })).filter((group) => group.items.length > 0);

  // หัวข้อที่เปิดอยู่ไม่ได้อยู่บนแถบ แปลว่าเข้ามาจากปุ่มอื่น ๆ จึงต้องเน้นปุ่มนั้นแทน
  const inSheet = !BAR_KEYS.has(active);

  return (
    <>
      {open && (
        <>
          <button className="mnav-veil" onClick={() => setOpen(false)} aria-label="ปิดเมนู" />
          <div className="mnav-sheet" role="dialog" aria-label="หัวข้ออื่น">
            <span className="mnav-grip" aria-hidden="true" />

            {rest.map((group) => (
              <div
                className={group.demo ? "mnav-group demo" : "mnav-group"}
                key={group.title}
              >
                <p className="mnav-group-head">
                  {group.title}
                  {group.note && <span>{group.note}</span>}
                </p>
                <div className="mnav-group-items">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      className={active === item.key ? "mnav-item active" : "mnav-item"}
                      aria-current={active === item.key ? "page" : undefined}
                      onClick={() => pick(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* ปุ่มสองตัวนี้อยู่บนแถบหัวเว็บตอนจอกว้าง ย้ายลงมาที่นี่ตอนจอแคบ
                เพื่อให้แถบหัวเว็บเหลือแถวเดียวคือโลโก้ ช่องค้นหา และระฆัง */}
            <div className="mnav-tools">
              <button className="mnav-item" onClick={onToggleTheme}>
                {theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
              </button>
              <button className="mnav-item" onClick={onSignOut}>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </>
      )}

      <nav className="mnav" aria-label="หัวข้อหลัก">
        {BAR_TABS.map((tab) => (
          <button
            key={tab.key}
            className={active === tab.key ? "mnav-btn active" : "mnav-btn"}
            aria-current={active === tab.key ? "page" : undefined}
            onClick={() => pick(tab.key)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {tab.icon}
            </svg>
            {tab.label}
          </button>
        ))}

        <button
          className={inSheet || open ? "mnav-btn active" : "mnav-btn"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.5" className="mnav-dot" />
            <circle cx="12" cy="12" r="1.5" className="mnav-dot" />
            <circle cx="18.5" cy="12" r="1.5" className="mnav-dot" />
          </svg>
          อื่น ๆ
        </button>
      </nav>
    </>
  );
}
