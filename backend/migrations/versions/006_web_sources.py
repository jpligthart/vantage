"""Add web source type metadata columns.

Revision ID: 006
Revises: 005
Create Date: 2026-10-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("sources") as batch:
        batch.add_column(sa.Column("origin_url", sa.String(2048), nullable=True))
        batch.add_column(sa.Column("web_mode", sa.Enum("page", "site", name="webmode"), nullable=True))
        batch.add_column(sa.Column("page_count", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("sources") as batch:
        batch.drop_column("last_refreshed_at")
        batch.drop_column("last_checked_at")
        batch.drop_column("page_count")
        batch.drop_column("web_mode")
        batch.drop_column("origin_url")
