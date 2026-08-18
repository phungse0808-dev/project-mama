"""จัดการการเชื่อมต่อฐานข้อมูล"""

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables() -> None:
    """สร้างตารางทั้งหมดตาม model ที่ประกาศไว้ (ถ้ายังไม่มี)"""
    import app.models  # noqa: F401  ต้อง import เพื่อให้ SQLModel รู้จักทุกตาราง

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
