from sqlalchemy import text
from sqlalchemy.orm import Session


def index_chunk(db: Session, chunk_id: str, document_id: str, content: str) -> None:
    db.execute(
        text("INSERT INTO chunk_fts (chunk_id, document_id, content) VALUES (:cid, :did, :content)"),
        {"cid": chunk_id, "did": document_id, "content": content},
    )


def remove_chunks_for_document(db: Session, document_id: str) -> None:
    db.execute(
        text("DELETE FROM chunk_fts WHERE document_id = :did"),
        {"did": document_id},
    )
