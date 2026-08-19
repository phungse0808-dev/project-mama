type Props = { size?: number };

/**
 * ไอคอนของระบบ รูปคนใส่หน้ากากกันฝุ่นในวงแหวนระดับคุณภาพอากาศ
 *
 * ทำไมเป็นรูปนี้
 *     หน้ากากบอกว่าระบบนี้เกี่ยวกับฝุ่นและการป้องกันตัว
 *     วงแหวนห้าสีคือระดับคุณภาพอากาศตามมาตรฐานไทย เรียงจากดีมากถึงมีผลกระทบ
 *     ใช้สีชุดเดียวกับแถบสัดส่วนสถานีในหน้าแดชบอร์ด คนใช้บ่อยจะจำสีชุดนี้ได้
 *     เม็ดสีรอบนอกคืออนุภาคฝุ่นที่ลอยอยู่ บอกว่าหน้ากากกันอะไร
 *
 * วาดเป็น SVG ไม่ใช่ไฟล์ภาพ เพราะต้องคมทั้งตอนเป็นไอคอนเล็กบนแถบเมนู
 * และตอนขยายใหญ่เป็นไอคอนแอปบนหน้าจอมือถือ ใช้รูปเดียวกันได้ทุกขนาด
 */
export function AppIcon({ size = 44 }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="ระบบเฝ้าระวังคุณภาพอากาศ PM2.5"
    >
      <rect width="100" height="100" rx="22" fill="#16233a" />

      <circle cx="19" cy="20" r="3.4" fill="#0099ff" />
      <circle cx="81" cy="19" r="2.8" fill="#00b050" />
      <circle cx="27" cy="12" r="2" fill="#ffd400" opacity=".8" />
      <circle cx="72" cy="11" r="2.2" fill="#0099ff" opacity=".8" />
      <circle cx="12" cy="33" r="2" fill="#00b050" opacity=".6" />
      <circle cx="88" cy="34" r="2" fill="#ffd400" opacity=".6" />

      {/* วงแหวนห้าช่วง เท่ากับห้าระดับคุณภาพอากาศ หมุนตั้งต้นให้ช่วงแรกเริ่มที่ยอด */}
      <g fill="none" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r="42" stroke="#0099ff" strokeDasharray="48 216" />
        <circle cx="50" cy="50" r="42" stroke="#00b050" strokeDasharray="48 216" strokeDashoffset="-52.8" />
        <circle cx="50" cy="50" r="42" stroke="#ffd400" strokeDasharray="48 216" strokeDashoffset="-105.6" />
        <circle cx="50" cy="50" r="42" stroke="#ff7e00" strokeDasharray="48 216" strokeDashoffset="-158.3" />
        <circle cx="50" cy="50" r="42" stroke="#e2574c" strokeDasharray="48 216" strokeDashoffset="-211.1" />
      </g>

      {/* สายคล้องหู ตัวหน้ากาก คลิปหนีบจมูก และรอยจีบ */}
      <path d="M24 52h8M68 52h8" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 46h36v17c0 6-8 12-18 12s-18-6-18-12V46z" fill="#fff" />
      <path
        d="M36 46l14 5 14-5"
        fill="none"
        stroke="#a9b8cc"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M34 56h32M35 63h30" stroke="#c9d3e0" strokeWidth="3" strokeLinecap="round" />

      <circle cx="42" cy="37" r="3.4" fill="#fff" />
      <circle cx="58" cy="37" r="3.4" fill="#fff" />
    </svg>
  );
}
