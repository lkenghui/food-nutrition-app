import anthropic
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"), timeout=60.0)
MODEL = "claude-haiku-4-5-20251001"


def _parse_nutrition_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        raw = match.group()
    data = json.loads(raw)
    for key in ("calories", "protein_g", "carbs_g", "fat_g", "fiber_g"):
        data[key] = float(data.get(key) or 0)
    data.setdefault("food_name", "")
    data.setdefault("serving_note", "")
    data.setdefault("highlights", [])
    data.setdefault("warning", None)
    return data


NUTRITION_SYSTEM = (
    "You are a precise nutrition analyst. "
    "Return ONLY valid JSON with these exact keys:\n"
    "  food_name (string — short name of the food/meal),\n"
    "  calories (number), protein_g (number), carbs_g (number), "
    "fat_g (number), fiber_g (number),\n"
    "  serving_note (string — portion size assumed),\n"
    "  highlights (array of up to 3 short strings — notable nutrients or health points),\n"
    "  warning (string or null — any significant health concern).\n"
    "Use realistic average values. No markdown, no explanation."
)


def analyse_food(description: str) -> dict:
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=NUTRITION_SYSTEM,
        messages=[{"role": "user", "content": f"Analyse: {description}"}],
    )
    return _parse_nutrition_json(response.content[0].text)


def analyse_food_image(image_base64: str, media_type: str = "image/jpeg") -> dict:
    """Analyse a food photo using Claude vision."""
    # Claude supports jpeg, png, gif, webp
    if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
        media_type = "image/jpeg"
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=NUTRITION_SYSTEM,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_base64,
                    },
                },
                {
                    "type": "text",
                    "text": (
                        "Analyse this food photo. Identify all food items visible, "
                        "estimate portion sizes, and return the combined nutrition totals."
                    ),
                },
            ],
        }],
    )
    return _parse_nutrition_json(response.content[0].text)


def suggest_meals(remaining_calories: float, remaining_protein: float) -> str:
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
