import anthropic
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"), timeout=60.0)
MODEL = "claude-haiku-4-5-20251001"


def analyse_food(description: str) -> dict:
    """
    Returns a dict with keys:
      calories, protein_g, carbs_g, fat_g, fiber_g,
      serving_note, highlights (list of str), warning (str or None)
    """
    system = (
        "You are a precise nutrition analyst. "
        "Given a food description, return ONLY valid JSON with these keys:\n"
        "  calories (number), protein_g (number), carbs_g (number), "
        "fat_g (number), fiber_g (number),\n"
        "  serving_note (string — what portion size you assumed),\n"
        "  highlights (array of up to 3 short strings — notable nutrients or health points),\n"
        "  warning (string or null — any significant health concern, e.g. very high sodium).\n"
        "Use realistic average values. Do not include markdown or explanation."
    )
    user = f"Analyse: {description}"

    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    raw = response.content[0].text.strip()

    # Strip markdown fences if present
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    # Extract first JSON object
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        raw = match.group()

    data = json.loads(raw)

    # Normalise types
    for key in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g"):
        data[key] = float(data.get(key) or 0)
    data.setdefault("serving_note", "")
    data.setdefault("highlights", [])
    data.setdefault("warning", None)
    return data


def suggest_meals(remaining_calories: float, remaining_protein: float) -> str:
    """Returns a short plain-text meal suggestion."""
    system = "You are a helpful nutrition coach. Give brief, practical advice in 2-3 sentences."
    user = (
        f"I have {remaining_calories:.0f} calories and {remaining_protein:.0f}g protein "
        "left for today. Suggest one or two simple meal or snack ideas that fit."
    )
    response = client.messages.create(
        model=MODEL,
        max_tokens=150,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return response.content[0].text.strip()
