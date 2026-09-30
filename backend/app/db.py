"""จัดการการเชื่อมต่อฐานข้อมูล"""

from collections.abc import Generator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from app.config import DATABASE_URL

IS_SQLITE = DATABASE_URL.startswith("sqlite")

connect_args = {"check_same_thread": False} if IS_SQLITE else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)

#: รอได้นานแค่ไหนถ้าฐานข้อมูลถูกล็อกอยู่ (มิลลิวินาที)
#:
#: ค่าเดิมของ SQLite คือห้าวินาที ซึ่งสั้นกว่าเวลาที่หน้าฝุ่นกับผู้ป่วยใช้คำนวณ
#: พอตัวเก็บข้อมูลเขียนฐานข้อมูลระหว่างนั้น การอ่านจะหมดเวลาแล้วตอบ 500
BUSY_TIMEOUT_MS = 30_000


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(connection, _record) -> None:
    """ตั้งค่า SQLite ทุกครั้งที่เปิดการเชื่อมต่อใหม่

    ต้องตั้งต่อการเชื่อมต่อ ไม่ใช่ต่อฐานข้อมูล เพราะ busy_timeout ไม่ได้เก็บลงไฟล์
    ส่วน WAL เก็บลงไฟล์ครั้งเดียว แต่สั่งซ้ำไม่เสียหายและทำให้ไฟล์ใหม่ได้ค่าเดียวกัน

    WAL ทำให้คนอ่านกับคนเขียนทำงานพร้อมกันได้ ต่างจากโหมดเดิมที่คนเขียน
    ล็อกทั้งไฟล์จนคนอ่านเข้าไม่ได้ ระบบนี้มีตัวเก็บข้อมูลเขียนทุกชั่วโมง
    ขณะที่หน้าเว็บอ่านอยู่ตลอด จึงต้องใช้ WAL
    """
    if not IS_SQLITE:
        return
    cursor = connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    finally:
        cursor.close()


def create_db_and_tables() -> None:
    """สร้างตารางทั้งหมดตาม model ที่ประกาศไว้ (ถ้ายังไม่มี)"""
    import app.models  # noqa: F401  ต้อง import เพื่อให้ SQLModel รู้จักทุกตาราง

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
