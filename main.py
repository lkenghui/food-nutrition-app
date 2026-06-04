import os
from datetime import date
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from database import init_db, log_meal, get_meals_for_date, get_recent_meals, delete_meal
from agents import analyse_food, suggest_meals

init_db()
app = FastAPI(title="Food Nutrition App")

DAILY_GOALS = {
    "calories": float(os.getenv("GOAL_CALORIES", 2000)),
    "protein_g": float(os.getenv("GOAL_PROTEIN", 50)),
    "carbs_g": float(os.getenv("GOAL_CARBS", 250)),
    "fat_g": float(os.getenv("GOAL_FAT", 65)),
    "fiber_g": float(os.getenv("GOAL_FIBER", 25)),
}


class AnalyseRequest(BaseModel):
    description: str
    meal_type: str = "snack"


class LogRequest(BaseModel):
    description: str
    meal_type: str = "snack"
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    serving_note: str = ""
    highlights: list[str] = []
    warning: str | None = None


@app.post("/api/analyse")
def analyse(req: AnalyseRequest):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description required")
    try:
        result = analyse_food(req.description.strip())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/log")
def log(req: LogRequest):
    meal_id = log_meal(
        description=req.description,
        meal_type=req.meal_type,
        calories=req.calories,
        protein_g=req.protein_g,
        carbs_g=req.carbs_g,
        fat_g=req.fat_g,
        fiber_g=req.fiber_g,
        notes=req.serving_note,
    )
    return {"id": meal_id}


@app.get("/api/today")
def today(day: str = Query(default="")):
    if not day:
        day = date.today().isoformat()
    rows = get_meals_for_date(day)
    meals = [dict(r) for r in rows]
    totals = {k: sum(m.get(k) or 0 for m in meals)
              for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    return {"day": day, "meals": meals, "totals": totals, "goals": DAILY_GOALS}


@app.get("/api/history")
def history():
    rows = get_recent_meals(30)
    return [dict(r) for r in rows]


@app.delete("/api/meal/{meal_id}")
def remove_meal(meal_id: int):
    delete_meal(meal_id)
    return {"ok": True}


@app.get("/api/suggest")
def suggest(day: str = Query(default="")):
    if not day:
        day = date.today().isoformat()
    rows = get_meals_for_date(day)
    meals = [dict(r) for r in rows]
    consumed_cal = sum(m.get("calories") or 0 for m in meals)
    consumed_pro = sum(m.get("protein_g") or 0 for m in meals)
    rem_cal = max(0, DAILY_GOALS["calories"] - consumed_cal)
    rem_pro = max(0, DAILY_GOALS["protein_g"] - consumed_pro)
    suggestion = suggest_meals(rem_cal, rem_pro)
    return {"suggestion": suggestion}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def index():
    return FileResponse("frontend/index.html")
