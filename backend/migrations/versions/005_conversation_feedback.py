"""Move feedback_draft from analysis_sessions to conversations.

Revision ID: 005
Revises: 004
Create Date: 2026-10-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("feedback_draft", sa.Text(), nullable=False, server_default=""),
    )

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, feedback_draft FROM analysis_sessions "
            "WHERE feedback_draft IS NOT NULL AND feedback_draft != ''"
        )
    ).fetchall()
    for session_id, draft in rows:
        first_conv = bind.execute(
            sa.text(
                "SELECT id FROM conversations WHERE session_id = :session_id "
                "ORDER BY created_at ASC LIMIT 1"
            ),
            {"session_id": session_id},
        ).fetchone()
        if first_conv:
            bind.execute(
                sa.text(
                    "UPDATE conversations SET feedback_draft = :draft WHERE id = :conv_id"
                ),
                {"draft": draft, "conv_id": first_conv[0]},
            )

    with op.batch_alter_table("analysis_sessions") as batch:
        batch.drop_column("feedback_draft")


def downgrade() -> None:
    op.add_column(
        "analysis_sessions",
        sa.Column("feedback_draft", sa.Text(), nullable=False, server_default=""),
    )

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT session_id, feedback_draft FROM conversations "
            "WHERE feedback_draft IS NOT NULL AND feedback_draft != '' "
            "ORDER BY created_at ASC"
        )
    ).fetchall()
    seen_sessions: set[str] = set()
    for session_id, draft in rows:
        if session_id in seen_sessions:
            continue
        seen_sessions.add(session_id)
        bind.execute(
            sa.text(
                "UPDATE analysis_sessions SET feedback_draft = :draft WHERE id = :session_id"
            ),
            {"draft": draft, "session_id": session_id},
        )

    with op.batch_alter_table("conversations") as batch:
        batch.drop_column("feedback_draft")
