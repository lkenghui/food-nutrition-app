import sqlite3
import os
from datetime import datetime, timezone, date

DB_PATH = os.getenv("DB_PATH", "nutrition.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS meals (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                logged_at    TEXT    NOT NULL,
                meal_type    TEXT    NOT NULL DEFAULT 'snack',
                description  TEXT    NOT NULL,
                calories     REAL,
                protein_g    REAL,
                carbs_g      REAL,
                fat_g        REAL,
                fiber_g      REAL,
                notes        TEXT
            )
        """)


def log_meal(description: str, meal_type: str, calories: float,
             protein_g: float, carbs_g: float, fat_g: float,
             fiber_g: float, notes: str) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO meals
               (logged_at, meal_type, description, calories, protein_g, carbs_g, fat_g, fiber_g, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (datetime.now(timezone.utc).isoformat(), meal_type, description,
             calories, protein_g, carbs_g, fat_g, fiber_g, notes),
        )
        return cur.lastrowid


def get_meals_for_date(day: str) -> list:
    """day format: YYYY-MM-DD"""
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM meals WHERE date(logged_at) = ? ORDER BY logged_at ASC",
            (day,),
        ).fetchall()


def get_recent_meals(limit: int = 20) -> list:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM meals ORDER BY logged_at DESC LIMIT ?",
            (limit,),
        ).fetchall()


def delete_meal(meal_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
