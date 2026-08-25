import { useEffect, useRef, useState } from "react";
import { formatThaiDateTime } from "../api";
import { LEVEL_COLORS, list, markAllRead, worstOf } from "../notificationLog";
import type { Notice } from "../notificationLog";

/** บอกเวลาแบบสั้น วันนี้บอกแค่เวลา วันก่อนหน้าบอกวันด้วย
 *
 * เพราะรายการส่วนใหญ่เป็นของวันนี้ การใส่วันที่ซ้ำทุกบรรทัดทำให้อ่านช้าลง
 * โดยไม่ได้ข้อมูลเพิ่ม
 */
function shortTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")} น.`;

  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return clock;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    at.getFullYear() === yesterday.getFullYear() &&
    at.getMonth() === yesterday.getMonth() &&
    at.getDate() === yesterday.getDate();
  if (isYesterday) return `เมื่อวาน ${clock}`;

  return formatThaiDateTime(iso);
}

/**
 * ระฆังแจ้งเตือนบนแถบเมนู
 *
 * ทำไมต้องมีทั้งที่มีการแจ้งเตือนแบบเด้งอยู่แล้ว
 *     ตัวที่เด้งพลาดตอนนั้นแล้วหายไปเลย ตามดูย้อนหลังไม่ได้
 *     และต้องขออนุญาตจากเบราว์เซอร์ก่อน ซึ่งคนส่วนใหญ่กดปฏิเสธ
 *     ระฆังไม่ต้องขออนุญาตอะไร ทุกคนใช้ได้ทันทีและย้อนดูได้
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // อ่านรายการใหม่ทุกครั้งที่เปิด และเป็นระยะขณะเปิดค้างไว้
  // เพราะรายการถูกเพิ่มจากที่อื่นในแอป ไม่ได้เพิ่มจากตัวระฆังเอง
  useEffect(() => {
    const refresh = () => setItems(list());
    refresh();
    const timer = setInterval(refresh, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // ปิดเมื่อคลิกที่อื่นหรือกด Escape
  // ทั้งสองทางเป็นพฤติกรรมที่คนคาดหวังจากเมนูลอย ถ้าไม่มีจะรู้สึกว่าปิดไม่ลง
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((item) => !item.read).length;
  // คิดสีจากรายการชุดเดียวกับที่แสดงอยู่ ไม่ไปอ่านที่เก็บข้อมูลซ้ำอีกรอบ
  // ถ้าอ่านแยกกัน สีของระฆังกับรายการในแผงอาจไม่ตรงกันได้
  const worst = worstOf(items);
  const now = new Date();

  // กำหนดสีตรง ๆ เสมอ ทั้งตอนมีเรื่องใหม่และตอนไม่มี
  //
  // เดิมส่ง undefined ตอนไม่มีเรื่องใหม่ หวังให้ตกไปใช้สีจาก CSS
  // แต่พอ React ถอด style ออก เบราว์เซอร์ยังค้างสีเดิมไว้
  // ปุ่มจึงติดสีของระดับล่าสุดและไม่ยอมกลับเป็นสีปกติ
  // การส่งค่าที่ชัดเจนทุกครั้งทำให้ไม่ต้องพึ่งพฤติกรรมตอนถอดค่าออก
  const bellColor = worst ? LEVEL_COLORS[worst] : "var(--text)";

  const toggle = () => {
    const next = !open;
    // อ่านรายการใหม่ทุกครั้งที่เปิด เพราะรายการถูกเพิ่มจากที่อื่นในแอป
    // ถ้ารอรอบอ่านอัตโนมัติทุกหนึ่งนาที ผู้ใช้จะเปิดมาเจอของเก่า
    if (next) setItems(list());
    setOpen(next);
    // ทำเครื่องหมายว่าอ่านแล้วตอนปิด ไม่ใช่ตอนเปิด
    // เพราะถ้าล้างตอนเปิด จุดสีของรายการจะหายไปต่อหน้าก่อนที่ผู้ใช้จะได้อ่าน
    if (!next && unread > 0) setItems(markAllRead());
  };

  return (
    <div className="bell" ref={boxRef}>
      <button
        className={worst ? "bell-button has-unread" : "bell-button"}
        onClick={toggle}
        aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการใหม่` : "การแจ้งเตือน"}
        aria-expanded={open}
        style={{ color: bellColor }}
      >
        {/* ไอคอนกินราวสองในสามของกรอบ ไม่ใช่ครึ่งเดียวเหมือนเดิม
            ที่ว่างรอบเยอะเกินทำให้ระฆังดูเล็กทั้งที่กรอบใหญ่พอแล้ว */}
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
          strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="bell-badge" style={{ background: LEVEL_COLORS[worst ?? "info"] }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="การแจ้งเตือน">
          <div className="bell-head">
            <span className="bell-title">การแจ้งเตือน</span>
            {unread > 0 && (
              <button className="bell-readall" onClick={() => setItems(markAllRead())}>
                อ่านทั้งหมดแล้ว
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="bell-empty">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            <ul className="bell-list">
              {items.map((item) => (
                <li key={item.id} className={item.read ? "bell-item" : "bell-item unread"}>
                  <span className="bell-dot" style={{ background: LEVEL_COLORS[item.level] }} />
                  <div className="bell-body">
                    <p className="bell-item-title">{item.title}</p>
                    <p className="bell-item-detail">{item.detail}</p>
                    <p className="bell-item-when">{shortTime(item.at, now)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="bell-foot">เก็บย้อนหลัง 7 วัน</p>
        </div>
      )}
    </div>
  );
}
