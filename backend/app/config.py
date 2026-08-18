"""ค่าตั้งต้นของระบบ รวมไว้ที่เดียวเพื่อให้แก้ง่าย"""

from pathlib import Path

import truststore

# เซิร์ฟเวอร์ Air4Thai ติดตั้งใบรับรองไม่ครบ (ขาด intermediate certificate)
# ชุดใบรับรองที่ Python ใช้เป็นค่าเริ่มต้นจึงตรวจสอบไม่ผ่าน
# แก้โดยให้ Python ใช้ที่เก็บใบรับรองของระบบปฏิบัติการแทน ซึ่งดึงใบที่ขาดมาเติมเองได้
# วิธีนี้ยังคงตรวจสอบความปลอดภัยครบถ้วน ต่างจากการปิด verify ทิ้งซึ่งไม่ควรทำ
truststore.inject_into_ssl()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"

DATA_DIR.mkdir(exist_ok=True)
RAW_DIR.mkdir(exist_ok=True)

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
