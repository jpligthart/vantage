"""Initial schema and FTS5

Revision ID: 001
Revises:
Create Date: 2026-03-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("type", sa.Enum("pdf", "docx", name="sourcetype"), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column(
            "status",
            sa.Enum("queued", "processing", "ready", "failed", name="sourcestatus"),
            nullable=False,
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "analysis_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("preferred_model", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="CASCADE"), unique=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("docling_json_path", sa.String(1024), nullable=True),
        sa.Column("html_preview_path", sa.String(1024), nullable=True),
    )
    op.create_table(
        "document_sections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("parent_id", sa.String(36), sa.ForeignKey("document_sections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "source_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="CASCADE")),
        sa.Column("section_id", sa.String(36), sa.ForeignKey("document_sections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prompt_index", sa.Integer(), nullable=False),
        sa.Column("anchor_id", sa.String(64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("section_title", sa.String(512), nullable=True),
        sa.Column("bbox_json", sa.Text(), nullable=True),
    )
    op.create_table(
        "session_sources",
        sa.Column("session_id", sa.String(36), sa.ForeignKey("analysis_sessions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("analysis_sessions.id", ondelete="CASCADE")),
        sa.Column("role", sa.Enum("user", "assistant", "system", name="messagerole"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("mode", sa.Enum("explore", "investigate", "spar", name="chatmode"), nullable=True),
        sa.Column("context_strategy", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "citations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("conversation_messages.id", ondelete="CASCADE")),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("chunk_id", sa.String(36), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("section_title", sa.String(512), nullable=True),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("bbox_json", sa.Text(), nullable=True),
    )
    op.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            content,
            tokenize='unicode61'
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chunk_fts")
    op.drop_table("citations")
    op.drop_table("conversation_messages")
    op.drop_table("session_sources")
    op.drop_table("source_chunks")
    op.drop_table("document_sections")
    op.drop_table("documents")
    op.drop_table("analysis_sessions")
    op.drop_table("sources")
