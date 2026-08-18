"""ค่าตั้งต้นของระบบ รวมไว้ที่เดียวเพื่อให้แก้ง่าย"""

from pathlib import Path

import certifi

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"

DATA_DIR.mkdir(exist_ok=True)
RAW_DIR.mkdir(exist_ok=True)

# ---------- ชุดใบรับรองสำหรับตรวจสอบเซิร์ฟเวอร์ปลายทาง ----------
#
# เซิร์ฟเวอร์ Air4Thai ตั้งค่าใบรับรองไม่ครบ ใบของเว็บออกโดย Let's Encrypt
# แต่ใบลูกโซ่ที่ส่งตามมาเป็นของ Sectigo ซึ่งเป็นของใบเก่าคนละสายกัน
# เท่ากับไม่ได้ส่งใบเชื่อมที่ถูกต้องมาเลย
#
# Windows ยังเข้าได้เพราะไปดาวน์โหลดใบที่ขาดมาเติมเองอัตโนมัติ (AIA fetching)
# แต่ Linux ไม่ทำแบบนั้น การรันบน GitHub Actions จึงล้มเหลว
#
# แก้โดยเตรียมใบที่ขาดไว้ในโปรเจคเอง แล้วต่อท้ายชุดใบรับรองมาตรฐาน
# ได้สายเชื่อมครบคือ  ใบของเว็บ -> YR1 -> Root YR -> ISRG Root X1 (อยู่ใน certifi แล้ว)
#
# วิธีนี้ยังตรวจสอบความปลอดภัยครบถ้วน ต่างจากการปิด verify ทิ้งซึ่งไม่ควรทำ
# และทำให้ทั้ง Windows กับ Linux ใช้เส้นทางเดียวกัน ผลจึงเหมือนกันทุกเครื่อง
EXTRA_CERTS_DIR = DATA_DIR / "certs"
CA_BUNDLE_FILE = DATA_DIR / "ca_bundle.pem"


def _build_ca_bundle() -> str:
    """รวมชุดใบรับรองมาตรฐานเข้ากับใบที่เตรียมไว้เอง แล้วคืนที่อยู่ไฟล์"""
    parts = [Path(certifi.where()).read_text(encoding="utf-8")]
    if EXTRA_CERTS_DIR.is_dir():
        for pem in sorted(EXTRA_CERTS_DIR.glob("*.pem")):
            parts.append(pem.read_text(encoding="utf-8"))

    merged = chr(10).join(parts)
    # เขียนใหม่เฉพาะเมื่อเนื้อหาเปลี่ยน จะได้ไม่เขียนดิสก์ทุกครั้งที่เปิดโปรแกรม
    if not CA_BUNDLE_FILE.exists() or CA_BUNDLE_FILE.read_text(encoding="utf-8") != merged:
        CA_BUNDLE_FILE.write_text(merged, encoding="utf-8")
    return str(CA_BUNDLE_FILE)


CA_BUNDLE = _build_ca_bundle()

# ย้ายไป PostgreSQL ภายหลังได้โดยแก้บรรทัดนี้บรรทัดเดียว
DATABASE_URL = f"sqlite:///{DATA_DIR / 'airquality.db'}"

# แหล่งข้อมูลคุณภาพอากาศ กรมควบคุมมลพิษ (ไม่ต้องใช้ API key)
AIR4THAI_URL = "http://air4thai.pcd.go.th/services/getNewAQI_JSON.php"

# แหล่งข้อมูลอากาศ องค์การนาซา (ไม่ต้องใช้ API key)
NASA_POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
NASA_PARAMS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,PS"

REQUEST_TIMEOUT = 60

# ค่า -1 จาก Air4Thai หมายถึงไม่มีข้อมูล ไม่ใช่ค่าที่วัดได้จริง
MISSING_VALUE = -1.0

# ที่อยู่ของ frontend ที่อนุญาตให้เรียก API ได้
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
