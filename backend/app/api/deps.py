from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db

DbSession = Generator[Session, None, None]


def db_session(db: Session = Depends(get_db)) -> Session:
    return db
