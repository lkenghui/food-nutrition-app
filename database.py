import os
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone

DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_conn():
    # Render provides DATABASE_URL starting with "postgres://", psycopg2 needs "postgresql://"
    url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    conn = psycopg2.connect(url)
    return conn


def init_db():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS meals (
                    id          SERIAL PRIMARY KEY,
                    logged_at   TIMESTAMPTZ NOT NULL,
                    meal_type   TEXT        NOT NULL DEFAULT 'snack',
                    description TEXT        NOT NULL,
                    calories    REAL,
                    protein_g   REAL,
                    carbs_g     REAL,
                    fat_g       REAL,
                    fiber_g     REAL,
                    notes       TEXT
                )
            """)
        conn.commit()


def log_meal(description: str, meal_type: str, calories: float,
             protein_g: float, carbs_g: float, fat_g: float,
             fiber_g: float, notes: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO meals
                   (logged_at, meal_type, description, calories, protein_g, carbs_g, fat_g, fiber_g, notes)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (datetime.now(timezone.utc), meal_type, description,
                 calories, protein_g, carbs_g, fat_g, fiber_g, notes),
            )
            meal_id = cur.fetchone()[0]
        conn.commit()
    return meal_id


def get_meals_for_date(day: str) -> list:
    """day format: YYYY-MM-DD"""
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM meals WHERE logged_at::date = %s ORDER BY logged_at ASC",
                (day,),
            )
            return cur.fetchall()


def get_recent_meals(limit: int = 30) -> list:
    with get_conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM meals ORDER BY logged_at DESC LIMIT %s",
                (limit,),
            )
            return cur.fetchall()


def delete_meal(meal_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM meals WHERE id = %s", (meal_id,))
        conn.commit()
