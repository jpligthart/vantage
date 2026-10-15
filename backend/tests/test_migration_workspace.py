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


def test_upgrade_005_moves_session_feedback_draft_to_first_conversation(tmp_path):
    db_path = tmp_path / "migrate_feedback.db"
    _alembic(db_path, tmp_path, "004")

    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO analysis_sessions (id, title, feedback_draft) "
        "VALUES ('sess-1', 'Sessie', 'Bestaande feedback')"
    )
    conn.execute(
        "INSERT INTO conversations (id, session_id, title) "
        "VALUES ('conv-1', 'sess-1', 'Gesprek 1')"
    )
    conn.commit()
    conn.close()

    _alembic(db_path, tmp_path, "head")

    conn = sqlite3.connect(db_path)
    session_cols = [row[1] for row in conn.execute("PRAGMA table_info(analysis_sessions)")]
    conv_cols = [row[1] for row in conn.execute("PRAGMA table_info(conversations)")]
    assert "feedback_draft" not in session_cols
    assert "feedback_draft" in conv_cols
    draft = conn.execute(
        "SELECT feedback_draft FROM conversations WHERE id = 'conv-1'"
    ).fetchone()
    conn.close()
    assert draft == ("Bestaande feedback",)

