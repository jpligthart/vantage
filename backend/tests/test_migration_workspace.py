import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _alembic(db_path: Path, data_dir: Path, revision: str) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"
    env["DATA_DIR"] = str(data_dir)
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=BACKEND,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def test_upgrade_moves_messages_onto_a_conversation(tmp_path):
    db_path = tmp_path / "migrate.db"
    _alembic(db_path, tmp_path, "001")

    conn = sqlite3.connect(db_path)
    conn.execute("INSERT INTO analysis_sessions (id, title) VALUES ('sess-1', 'Oud')")
    conn.execute(
        "INSERT INTO conversation_messages (id, session_id, role, content) "
        "VALUES ('msg-1', 'sess-1', 'user', 'hoi')"
    )
    conn.commit()
    conn.close()

    _alembic(db_path, tmp_path, "head")

    conn = sqlite3.connect(db_path)
    columns = [row[1] for row in conn.execute("PRAGMA table_info(conversation_messages)")]
    assert "conversation_id" in columns
    assert "session_id" not in columns
    message = conn.execute(
        "SELECT conversation_id, content FROM conversation_messages WHERE id = 'msg-1'"
    ).fetchone()
    conversation = conn.execute(
        "SELECT session_id, title FROM conversations WHERE id = ?",
        (message[0],),
    ).fetchone()
    conn.close()
    assert message[1] == "hoi"
    assert conversation == ("sess-1", "Gesprek 1")
