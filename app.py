"""
╔══════════════════════════════════════════════════════════════════════╗
║          IBM Watsonx.ai  ·  AI Nutrition Agent  ·  Flask Backend    ║
╚══════════════════════════════════════════════════════════════════════╝

AGENT_INSTRUCTIONS
══════════════════
Customize the agent behavior by editing the variables below.
No code changes required — just update the strings and flags.

  AGENT_TONE          : "friendly" | "professional" | "motivational"
  AGENT_SPECIALIZATION: Free-text describing the agent's diet specialty
  AGENT_LANGUAGE_HINT : Primary language / regional food preference
  AGENT_SAFETY_RULES  : List of hard rules the agent must always follow
  AGENT_INDIAN_FOODS  : Enable/disable Indian food context & suggestions
  AGENT_MAX_CALORIES  : Default daily calorie ceiling in suggestions
  AGENT_SYSTEM_PROMPT : The full system prompt injected into every call
                        (assembled automatically from the vars above, or
                         replace with a fully custom string)
"""

import os, json, re
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

# ──────────────────────────────────────────────────────────────────────
# AGENT INSTRUCTIONS  ← edit freely
# ──────────────────────────────────────────────────────────────────────
AGENT_TONE = "friendly and motivational"          # tone of every reply

AGENT_SPECIALIZATION = (
    "holistic nutrition, weight management, sports nutrition, "
    "diabetic diet, heart-healthy diets, and Indian traditional cuisine"
)

AGENT_LANGUAGE_HINT = "Indian English"            # flavour of language

AGENT_INDIAN_FOODS = True                         # include Indian foods

AGENT_MAX_CALORIES = 2500                         # default daily ceiling

AGENT_SAFETY_RULES = [
    "Always recommend consulting a registered dietitian or doctor before "
    "starting any new diet, especially for medical conditions.",
    "Never recommend extreme calorie restriction below 1200 kcal/day for "
    "adults without noting serious medical supervision is required.",
    "Do not diagnose diseases or replace professional medical advice.",
    "If the user mentions an eating disorder, respond with empathy and "
    "gently suggest professional support.",
    "Keep all advice age-appropriate; apply extra caution for children "
    "under 12 and elderly users above 65.",
]

# Assembled system prompt (edit the template or replace entirely)
AGENT_SYSTEM_PROMPT = f"""You are NutriBot, an AI-powered nutrition expert built with IBM Watsonx.ai.

Tone & Style:
- Be {AGENT_TONE}.
- Use {AGENT_LANGUAGE_HINT} naturally.
- Keep responses concise, well-structured, and easy to read.
- Use bullet points, numbered lists, and clear headings where helpful.

Specialization:
- You specialise in {AGENT_SPECIALIZATION}.
{"- You have deep knowledge of Indian foods: dal, sabzi, roti, rice, idli, dosa, biryani, khichdi, lassi, paneer dishes, regional thalis, Ayurvedic food principles, and more." if AGENT_INDIAN_FOODS else ""}

Capabilities:
1. Personalised nutrition & meal plans (daily / weekly).
2. Calorie & macro-nutrient analysis.
3. Family diet management (different profiles in one household).
4. BMI interpretation and healthy-weight guidance.
5. Healthy recipe ideas and ingredient substitutions.
6. Grocery lists aligned with the user's meal plan.
7. Hydration and micronutrient tips.
8. Festival / occasion-specific healthy eating (e.g., Navratri fasting, Ramadan).

Default daily calorie ceiling: {AGENT_MAX_CALORIES} kcal unless the user specifies otherwise.

Safety Rules (non-negotiable):
{"".join(f"{chr(10)}- {rule}" for rule in AGENT_SAFETY_RULES)}

Response Format:
- When providing a meal plan, always include: Meal name | Ingredients | Approx. calories | Prep time.
- When calculating BMI, show the formula result and the WHO category.
- End each response with one quick actionable tip labelled 💡 Tip.
"""
# ──────────────────────────────────────────────────────────────────────

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev-secret-change-me")

# ── Watsonx.ai client ─────────────────────────────────────────────────
def _build_model() -> ModelInference:
    api_key = os.getenv("IBM_API_KEY", "")
    project_id = os.getenv("IBM_PROJECT_ID", "")
    url = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")

    if not api_key or api_key.startswith("your_"):
        raise RuntimeError(
            "IBM_API_KEY is not set. Copy .env.example → .env and fill in your credentials."
        )

    credentials = Credentials(url=url, api_key=api_key)
    client = APIClient(credentials=credentials, project_id=project_id)

    params = {
        GenParams.MAX_NEW_TOKENS: 1024,
        GenParams.TEMPERATURE: 0.7,
        GenParams.TOP_P: 0.9,
        GenParams.REPETITION_PENALTY: 1.1,
    }

    return ModelInference(
        model_id="meta-llama/llama-3-3-70b-instruct",
        api_client=client,
        params=params,
        project_id=project_id,
    )


_model: ModelInference | None = None


def get_model() -> ModelInference:
    global _model
    if _model is None:
        _model = _build_model()
    return _model


# ── Helpers ───────────────────────────────────────────────────────────
def _chat_history_to_prompt(history: list[dict], user_message: str, profile: dict) -> str:
    """Build a plain-text prompt from chat history + current message."""
    profile_block = ""
    if profile:
        profile_block = (
            f"\n[User Profile]\n"
            f"Name: {profile.get('name','Unknown')}\n"
            f"Age: {profile.get('age','N/A')}  |  "
            f"Gender: {profile.get('gender','N/A')}  |  "
            f"Weight: {profile.get('weight','N/A')} kg  |  "
            f"Height: {profile.get('height','N/A')} cm\n"
            f"Goal: {profile.get('goal','General wellness')}\n"
            f"Dietary restrictions: {profile.get('restrictions','None')}\n"
            f"Medical conditions: {profile.get('conditions','None')}\n"
        )

    prompt = f"{AGENT_SYSTEM_PROMPT}{profile_block}\n\n"

    for turn in history[-10:]:          # keep last 10 turns as context
        role = turn.get("role", "user")
        content = turn.get("content", "")
        prompt += f"{'User' if role == 'user' else 'NutriBot'}: {content}\n\n"

    prompt += f"User: {user_message}\n\nNutriBot:"
    return prompt


def _calculate_bmi(weight_kg: float, height_cm: float) -> dict:
    h_m = height_cm / 100
    bmi = round(weight_kg / (h_m ** 2), 1)
    if bmi < 18.5:
        category, advice = "Underweight", "Consider a calorie-surplus plan rich in proteins and healthy fats."
    elif bmi < 25:
        category, advice = "Normal weight", "Great! Maintain your current healthy habits."
    elif bmi < 30:
        category, advice = "Overweight", "A moderate calorie deficit with more fiber and lean protein can help."
    else:
        category, advice = "Obese", "Please consult a doctor; a structured diet and exercise plan is important."
    return {"bmi": bmi, "category": category, "advice": advice}


def _estimate_tdee(age: int, gender: str, weight: float, height: float, activity: str) -> int:
    """Harris-Benedict BMR × activity multiplier."""
    if gender.lower() in ("male", "m"):
        bmr = 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    else:
        bmr = 447.593 + 9.247 * weight + 3.098 * height - 4.330 * age

    multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "active": 1.725, "very_active": 1.9,
    }
    return int(bmr * multipliers.get(activity, 1.55))


# ── Routes ────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    history  = data.get("history", [])
    profile  = data.get("profile", {})

    try:
        model  = get_model()
        prompt = _chat_history_to_prompt(history, user_message, profile)
        result = model.generate_text(prompt=prompt)
        reply  = result.strip() if isinstance(result, str) else result
        return jsonify({"reply": reply, "timestamp": datetime.utcnow().isoformat()})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        return jsonify({"error": f"Model error: {exc}"}), 500


@app.route("/api/bmi", methods=["POST"])
def bmi():
    data = request.get_json(silent=True) or {}
    try:
        weight = float(data["weight"])
        height = float(data["height"])
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Provide weight (kg) and height (cm)"}), 400
    return jsonify(_calculate_bmi(weight, height))


@app.route("/api/tdee", methods=["POST"])
def tdee():
    data = request.get_json(silent=True) or {}
    try:
        result = _estimate_tdee(
            age      = int(data["age"]),
            gender   = str(data["gender"]),
            weight   = float(data["weight"]),
            height   = float(data["height"]),
            activity = str(data.get("activity", "moderate")),
        )
        return jsonify({"tdee": result})
    except (KeyError, ValueError, TypeError) as exc:
        return jsonify({"error": f"Invalid input: {exc}"}), 400


@app.route("/api/meal-plan", methods=["POST"])
def meal_plan():
    """Ask the model to produce a structured weekly meal plan."""
    data    = request.get_json(silent=True) or {}
    profile = data.get("profile", {})
    days    = int(data.get("days", 7))
    goal    = data.get("goal", profile.get("goal", "balanced nutrition"))

    prompt = (
        f"{AGENT_SYSTEM_PROMPT}\n\n"
        f"Generate a {days}-day meal plan for the following profile:\n"
        f"Goal: {goal}\n"
        f"Dietary restrictions: {profile.get('restrictions','None')}\n"
        f"Cuisine preference: {'Indian + International' if AGENT_INDIAN_FOODS else 'International'}\n"
        f"Daily calorie target: {profile.get('calories', AGENT_MAX_CALORIES)} kcal\n\n"
        "Format each day as:\n"
        "**Day N**\n"
        "- Breakfast: <name> | ~<kcal> kcal\n"
        "- Mid-Morning Snack: <name> | ~<kcal> kcal\n"
        "- Lunch: <name> | ~<kcal> kcal\n"
        "- Evening Snack: <name> | ~<kcal> kcal\n"
        "- Dinner: <name> | ~<kcal> kcal\n"
        "- Total: ~<kcal> kcal\n"
    )
    try:
        reply = get_model().generate_text(prompt=prompt)
        return jsonify({"plan": reply.strip()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/analyze-meal", methods=["POST"])
def analyze_meal():
    """Calorie + macro breakdown for a described meal."""
    data = request.get_json(silent=True) or {}
    meal = (data.get("meal") or "").strip()
    if not meal:
        return jsonify({"error": "Provide a meal description"}), 400

    prompt = (
        f"{AGENT_SYSTEM_PROMPT}\n\n"
        f"Analyze the nutritional content of this meal and provide:\n"
        f"1. Estimated total calories\n"
        f"2. Macronutrients (protein, carbs, fat, fiber) in grams\n"
        f"3. Key micronutrients\n"
        f"4. Health rating (1-10) with brief explanation\n"
        f"5. One improvement suggestion\n\n"
        f"Meal: {meal}\n\nNutriBot:"
    )
    try:
        reply = get_model().generate_text(prompt=prompt)
        return jsonify({"analysis": reply.strip()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/family-plan", methods=["POST"])
def family_plan():
    """Generate diet recommendations for multiple family members."""
    data    = request.get_json(silent=True) or {}
    members = data.get("members", [])
    if not members:
        return jsonify({"error": "Provide at least one family member"}), 400

    member_block = "\n".join(
        f"- {m.get('name','Member')} | Age {m.get('age','?')} | "
        f"Gender {m.get('gender','?')} | Goal: {m.get('goal','wellness')} | "
        f"Restrictions: {m.get('restrictions','None')}"
        for m in members
    )
    prompt = (
        f"{AGENT_SYSTEM_PROMPT}\n\n"
        "Create personalised diet recommendations for each family member below.\n"
        "For each member include: daily calorie target, key nutrients to focus on, "
        "3 recommended meals, and 1 food to avoid.\n\n"
        f"Family Members:\n{member_block}\n\nNutriBot:"
    )
    try:
        reply = get_model().generate_text(prompt=prompt)
        return jsonify({"recommendations": reply.strip()})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "meta-llama/llama-3-3-70b-instruct",
                    "agent": "NutriBot", "indian_foods": AGENT_INDIAN_FOODS})


# ── Entry point ───────────────────────────────────────────────────────
if __name__ == "__main__":
    port  = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "False").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
