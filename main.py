import os
from datetime import date
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from database import init_db, log_meal, get_meals_for_date, get_recent_meals, delete_meal
from agents import analyse_food, analyse_food_image, suggest_meals

init_db()
app = FastAPI(title="Food Nutrition App")

DEFAULT_GOALS = {
    "calories": float(os.getenv("GOAL_CALORIES", 2000)),
    "protein_g": float(os.getenv("GOAL_PROTEIN", 50)),
    "carbs_g":   float(os.getenv("GOAL_CARBS", 250)),
    "fat_g":     float(os.getenv("GOAL_FAT", 65)),
    "fiber_g":   float(os.getenv("GOAL_FIBER", 25)),
}


class AnalyseRequest(BaseModel):
    description: str
    meal_type: str = "snack"


class PhotoRequest(BaseModel):
    image_base64: str
    media_type: str = "image/jpeg"


class LogRequest(BaseModel):
    description: str
    meal_type: str = "snack"
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    fiber_g: float
    serving_note: str = ""


@app.post("/api/analyse")
def analyse(req: AnalyseRequest):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="Description required")
    try:
        return analyse_food(req.description.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyse-photo")
def analyse_photo(req: PhotoRequest):
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="Image data required")
    try:
        return analyse_food_image(req.image_base64, req.media_type)
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


def _serialise(rows):
    """Convert RealDictRow list to plain dicts, making datetimes JSON-safe."""
    result = []
    for r in rows:
        d = dict(r)
        if hasattr(d.get("logged_at"), "isoformat"):
            d["logged_at"] = d["logged_at"].isoformat()
        result.append(d)
    return result


@app.get("/api/today")
def today(day: str = Query(default="")):
    if not day:
        day = date.today().isoformat()
    meals = _serialise(get_meals_for_date(day))
    totals = {k: sum(m.get(k) or 0 for m in meals)
              for k in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g")}
    return {"day": day, "meals": meals, "totals": totals, "goals": DEFAULT_GOALS}


@app.get("/api/history")
def history():
    return _serialise(get_recent_meals(30))


@app.delete("/api/meal/{meal_id}")
def remove_meal(meal_id: int):
    delete_meal(meal_id)
    return {"ok": True}


@app.get("/api/suggest")
def suggest(
    day: str = Query(default=""),
    goal_calories: float = Query(default=0),
    goal_protein: float = Query(default=0),
):
    if not day:
        day = date.today().isoformat()
    rows = get_meals_for_date(day)
    meals = [dict(r) for r in rows]
    consumed_cal = sum(m.get("calories") or 0 for m in meals)
    consumed_pro = sum(m.get("protein_g") or 0 for m in meals)
    cal_goal = goal_calories or DEFAULT_GOALS["calories"]
    pro_goal = goal_protein or DEFAULT_GOALS["protein_g"]
    rem_cal = max(0, cal_goal - consumed_cal)
    rem_pro = max(0, pro_goal - consumed_pro)
    return {"suggestion": suggest_meals(rem_cal, rem_pro)}


app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def index():
    return FileResponse("frontend/index.html")
