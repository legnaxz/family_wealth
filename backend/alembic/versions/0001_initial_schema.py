"""initial schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-03-05
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("otp_secret", sa.String(length=64), nullable=True),
        sa.Column("otp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "households",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "household_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.UniqueConstraint("household_id", "user_id", name="uq_household_user"),
    )
    op.create_index("ix_household_members_household_id", "household_members", ["household_id"])
    op.create_index("ix_household_members_user_id", "household_members", ["user_id"])

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
    )
    op.create_index("ix_accounts_household_id", "accounts", ["household_id"])

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=60), nullable=False),
    )
    op.create_index("ix_assets_household_id", "assets", ["household_id"])

    op.create_table(
        "liabilities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("lender", sa.String(length=120), nullable=True),
    )
    op.create_index("ix_liabilities_household_id", "liabilities", ["household_id"])

    op.create_table(
        "valuations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("liability_id", sa.Integer(), sa.ForeignKey("liabilities.id"), nullable=True),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
    )
    op.create_index("ix_valuations_household_id", "valuations", ["household_id"])
    op.create_index("ix_valuations_as_of_date", "valuations", ["as_of_date"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("tx_date", sa.Date(), nullable=False),
        sa.Column("tx_type", sa.String(length=40), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("subcategory", sa.String(length=120), nullable=True),
        sa.Column("content", sa.String(length=255), nullable=True),
        sa.Column("payment_method", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("tx_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("household_id", "tx_hash", name="uq_household_tx_hash"),
    )
    op.create_index("ix_transactions_household_id", "transactions", ["household_id"])
    op.create_index("ix_transactions_tx_date", "transactions", ["tx_date"])
    op.create_index("ix_transactions_tx_hash", "transactions", ["tx_hash"])

    op.create_table(
        "invitation_tokens",
        sa.Column("token", sa.String(length=128), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("used_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_invitation_tokens_household_id", "invitation_tokens", ["household_id"])
    op.create_index("ix_invitation_tokens_expires_at", "invitation_tokens", ["expires_at"])

    op.create_table(
        "net_worth_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("assets_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("liabilities_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("net_worth", sa.Numeric(18, 2), nullable=False),
        sa.UniqueConstraint("household_id", "snapshot_date", name="uq_household_snapshot_date"),
    )
    op.create_index("ix_net_worth_snapshots_household_id", "net_worth_snapshots", ["household_id"])
    op.create_index("ix_net_worth_snapshots_snapshot_date", "net_worth_snapshots", ["snapshot_date"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(length=60), nullable=False),
        sa.Column("target_type", sa.String(length=60), nullable=False),
        sa.Column("target_id", sa.String(length=60), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_household_id", "audit_logs", ["household_id"])
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_household_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_net_worth_snapshots_snapshot_date", table_name="net_worth_snapshots")
    op.drop_index("ix_net_worth_snapshots_household_id", table_name="net_worth_snapshots")
    op.drop_table("net_worth_snapshots")

    op.drop_index("ix_invitation_tokens_expires_at", table_name="invitation_tokens")
    op.drop_index("ix_invitation_tokens_household_id", table_name="invitation_tokens")
    op.drop_table("invitation_tokens")

    op.drop_index("ix_transactions_tx_hash", table_name="transactions")
    op.drop_index("ix_transactions_tx_date", table_name="transactions")
    op.drop_index("ix_transactions_household_id", table_name="transactions")
    op.drop_table("transactions")

    op.drop_index("ix_valuations_as_of_date", table_name="valuations")
    op.drop_index("ix_valuations_household_id", table_name="valuations")
    op.drop_table("valuations")

    op.drop_index("ix_liabilities_household_id", table_name="liabilities")
    op.drop_table("liabilities")

    op.drop_index("ix_assets_household_id", table_name="assets")
    op.drop_table("assets")

    op.drop_index("ix_accounts_household_id", table_name="accounts")
    op.drop_table("accounts")

    op.drop_index("ix_household_members_user_id", table_name="household_members")
    op.drop_index("ix_household_members_household_id", table_name="household_members")
    op.drop_table("household_members")

    op.drop_table("households")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
