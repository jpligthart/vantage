"""Sessions hold multiple conversations, sources, and shared memory.

Revision ID: 002
Revises: 001
Create Date: 2026-10-14

"""

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analysis_sessions", sa.Column("student", sa.String(256), nullable=True))
    op.add_column("analysis_sessions", sa.Column("subject", sa.String(256), nullable=True))
    op.add_column("sources", sa.Column("student", sa.String(256), nullable=True))
    op.add_column("sources", sa.Column("subject", sa.String(256), nullable=True))

    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("analysis_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "conversation_sources",
        sa.Column(
            "conversation_id",
            sa.String(36),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "source_id",
            sa.String(36),
            sa.ForeignKey("sources.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_table(
        "session_notes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("analysis_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    with op.batch_alter_table("conversation_messages") as batch:
        batch.add_column(sa.Column("conversation_id", sa.String(36), nullable=True))

    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    sessions = bind.execute(sa.text("SELECT id FROM analysis_sessions")).fetchall()
    for (session_id,) in sessions:
        conversation_id = str(uuid.uuid4())
        bind.execute(
            sa.text(
                "INSERT INTO conversations (id, session_id, title, created_at, updated_at) "
                "VALUES (:id, :session_id, :title, :created_at, :updated_at)"
            ),
            {
                "id": conversation_id,
                "session_id": session_id,
                "title": "Gesprek 1",
                "created_at": now,
                "updated_at": now,
            },
        )
        bind.execute(
            sa.text(
                "UPDATE conversation_messages SET conversation_id = :conversation_id "
                "WHERE session_id = :session_id"
            ),
            {"conversation_id": conversation_id, "session_id": session_id},
        )

    with op.batch_alter_table("conversation_messages") as batch:
        batch.alter_column("conversation_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key(
            "fk_conversation_messages_conversation_id",
            "conversations",
            ["conversation_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.drop_column("session_id")


def downgrade() -> None:
    with op.batch_alter_table("conversation_messages") as batch:
        batch.add_column(sa.Column("session_id", sa.String(36), nullable=True))

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE conversation_messages SET session_id = ("
            "SELECT session_id FROM conversations "
            "WHERE conversations.id = conversation_messages.conversation_id"
            ")"
        )
    )

    with op.batch_alter_table("conversation_messages") as batch:
        batch.alter_column("session_id", existing_type=sa.String(36), nullable=False)
        batch.create_foreign_key(
            "fk_conversation_messages_session_id",
            "analysis_sessions",
            ["session_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.drop_constraint(
            "fk_conversation_messages_conversation_id", type_="foreignkey"
        )
        batch.drop_column("conversation_id")

    op.drop_table("session_notes")
    op.drop_table("conversation_sources")
    op.drop_table("conversations")
    op.drop_column("sources", "subject")
    op.drop_column("sources", "student")
    op.drop_column("analysis_sessions", "subject")
    op.drop_column("analysis_sessions", "student")
