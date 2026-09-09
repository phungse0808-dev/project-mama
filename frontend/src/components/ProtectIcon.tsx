type Props = { name: string; color: string; size?: number };

/**
 * ไอคอนของคำแนะนำการป้องกัน
 *
 * ทำไมวาดเอง ไม่ใช้ไลบรารีไอคอน
 *     ทั้งเว็บไม่มีไลบรารีไอคอนอยู่แล้ว ไอคอนสภาพอากาศกับโลโก้ก็วาดเองทั้งคู่
 *     การดึงชุดไอคอนทั้งชุดเข้ามาเพื่อใช้แปดรูปทำให้ไฟล์ที่ผู้ใช้ต้องโหลดใหญ่ขึ้น
 *     โดยได้ประโยชน์แค่แปดรูป
 *
 * ทำไมใช้เส้นไม่ใช้พื้นทึบ
 *     ขนาดที่ใช้จริงคือยี่สิบพิกเซล รูปทึบที่เล็กขนาดนี้กลายเป็นก้อนสีที่แยกกันไม่ออก
 *     ส่วนเส้นยังเห็นรูปทรงได้ และรับสีของระดับมาจากที่เรียกใช้โดยตรง
 *
 * ชื่อไอคอนมาจากฝั่งหลังบ้านพร้อมข้อความ ไม่ได้จับคู่เอาที่หน้าเว็บ
 * เพราะไอคอนสื่อความหมายของข้อความนั้น จึงควรถูกกำหนดที่เดียวกับข้อความ
 */
export function ProtectIcon({ name, color, size = 20 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "mask":
      return (
        <svg {...common}>
          <path d="M4 9c3-1 5-1.5 8-1.5S17 8 20 9v3c0 3.3-3.6 6-8 6s-8-2.7-8-6V9z" />
          <path d="M4 10.5H2M22 10.5h-2" />
          <path d="M8 12h8" />
        </svg>
      );

    case "wind":
      return (
        <svg {...common}>
          <path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5" />
          <path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5" />
          <path d="M3 16h7" />
        </svg>
      );

    case "run":
      return (
        <svg {...common}>
          <circle cx="15" cy="4.5" r="1.8" />
          <path d="M13.5 21l1.5-5-3-2.5.8-4.5L9 11l-1.5 3" />
          <path d="M12.8 9l3.2 1.5 1.5 3.5h2.5" />
          <path d="M12 13.5L7 15l-2 5" />
        </svg>
      );

    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="2.6" />
        </svg>
      );

    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );

    case "home":
      return (
        <svg {...common}>
          <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5z" />
          <path d="M9.5 21v-6h5v6" />
        </svg>
      );

    case "ban":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6 6l12 12" />
        </svg>
      );

    case "heart":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9z" />
        </svg>
      );

    // ชื่อที่ไม่รู้จักคืนจุดกลม ไม่ใช่ไม่คืนอะไรเลย
    // เพราะถ้าหายไปทั้งช่อง ข้อความจะเลื่อนไม่ตรงกับช่องอื่นในแถวเดียวกัน
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      );
  }
}
