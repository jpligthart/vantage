"""Add source.is_reference and session.feedback_draft.

Revision ID: 003
Revises: 002
Create Date: 2026-10-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sources",
        sa.Column("is_reference", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "analysis_sessions",
        sa.Column("feedback_draft", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("analysis_sessions", "feedback_draft")
    op.drop_column("sources", "is_reference")
