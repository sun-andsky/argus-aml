"""
Case Management Service (PostgreSQL)
======================================
Neo4j holds the transaction graph; PostgreSQL holds investigator workflow
state — who reviewed what, case status, notes. These are deliberately
separate stores: graph structure and investigator workflow have very
different access patterns and don't belong in the same database.
"""

import os
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

VALID_STATUSES = {"open", "under_review", "escalated", "cleared", "confirmed_sar"}


class CaseService:
    def __init__(self):
        self.conn_params = {
            "host": os.getenv("POSTGRES_HOST", "localhost"),
            "port": os.getenv("POSTGRES_PORT", "5432"),
            "dbname": os.getenv("POSTGRES_DB", "aml_db"),
            "user": os.getenv("POSTGRES_USER", "aml_user"),
            "password": os.getenv("POSTGRES_PASSWORD"),
        }

        print("[CaseService] Connecting to PostgreSQL...")
        self.conn = psycopg2.connect(**self.conn_params)
        self.conn.autocommit = True
        print("[CaseService] Connected.")

        self._ensure_schema()

    def _ensure_schema(self):
        """Creates the cases table on first run if it doesn't already exist."""
        with self.conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cases (
                    id            SERIAL PRIMARY KEY,
                    account_id    TEXT NOT NULL,
                    status        TEXT NOT NULL DEFAULT 'open',
                    risk_score    FLOAT,
                    risk_tier     TEXT,
                    assigned_to   TEXT,
                    notes         TEXT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_cases_account_id ON cases(account_id);
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
            """)
        print("[CaseService] Schema verified.")

    def close(self):
        self.conn.close()

    def create_case(self, account_id: str, risk_score: float = None,
                     risk_tier: str = None, assigned_to: str = None) -> dict:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO cases (account_id, risk_score, risk_tier, assigned_to)
                VALUES (%s, %s, %s, %s)
                RETURNING *;
            """, (account_id, risk_score, risk_tier, assigned_to))
            return dict(cur.fetchone())

    def get_case(self, case_id: int) -> dict:
        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM cases WHERE id = %s;", (case_id,))
            row = cur.fetchone()
            if row is None:
                raise KeyError(f"Case {case_id} not found")
            return dict(row)

    def list_cases(self, status: str = None, account_id: str = None) -> list:
        query = "SELECT * FROM cases WHERE 1=1"
        params = []
        if status:
            query += " AND status = %s"
            params.append(status)
        if account_id:
            query += " AND account_id = %s"
            params.append(account_id)
        query += " ORDER BY created_at DESC;"

        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            return [dict(row) for row in cur.fetchall()]

    def update_case_status(self, case_id: int, status: str, notes: str = None) -> dict:
        if status not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")

        with self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                UPDATE cases
                SET status = %s,
                    notes = COALESCE(%s, notes),
                    updated_at = now()
                WHERE id = %s
                RETURNING *;
            """, (status, notes, case_id))
            row = cur.fetchone()
            if row is None:
                raise KeyError(f"Case {case_id} not found")
            return dict(row)
        

    def get_active_case_for_account(self, account_id: str) -> dict:
        """
        Returns the most recent active (open/under_review/escalated) case
        for an account, or None. Used to prevent duplicate auto-created
        alerts for an account that already has an unresolved case.
        """
        cases = self.list_cases(account_id=account_id)
        active = [c for c in cases if c["status"] in ("open", "under_review", "escalated")]
        return active[0] if active else None