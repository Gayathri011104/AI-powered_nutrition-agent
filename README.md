# 🥗 NutriBot — AI-Powered Nutrition Agent

> **IBM Watsonx.ai × Granite-13b-chat-v2 × Flask × Bootstrap 5**

NutriBot is a full-stack web application that acts as your personal AI nutrition coach.  
It is powered by **IBM Watsonx.ai** Granite large-language models and features a modern,
dark-mode-ready responsive UI with a rich set of nutrition tools.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Chat** | Conversational nutrition Q&A with memory (last 10 turns) |
| 📅 **Meal Planner** | 1-, 3-, or 7-day AI-generated meal plans with Indian food support |
| 🔍 **Meal Analyzer** | Calorie & macro breakdown for any described meal |
| ⚖️ **BMI + TDEE** | Interactive gauge chart + Harris-Benedict TDEE calculation |
| 👨‍👩‍👧 **Family Profiles** | Separate diet profiles for every household member |
| 📊 **Dashboard** | Macro doughnut chart, weekly calorie bar chart, hydration tracker |
| 🌙 **Dark Mode** | Full dark/light theme toggle with CSS variables |
| 📱 **Mobile-Ready** | Fully responsive with offcanvas navigation |
| 🔒 **Secure Credentials** | IBM API key stored in `.env`, never in code |
| 🎛️ **Agent Customisation** | `AGENT_INSTRUCTIONS` block in `app.py` — no code knowledge required |

---

## 🗂️ Project Structure

```
nutrition_agent/
├── app.py                  ← Flask backend + AGENT_INSTRUCTIONS
├── requirements.txt        ← Python dependencies
├── .env.example            ← Copy to .env and fill credentials
├── .gitignore
├── templates/
│   └── index.html          ← Single-page frontend (Jinja2)
└── static/
    ├── style.css           ← All custom styles + dark mode
    └── app.js              ← Full frontend logic (no framework)
```

---

## 🚀 Quick Start

### 1. Clone / copy the project

```bash
# If you cloned a repo:
cd nutrition_agent
```

### 2. Create a Python virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set up IBM Cloud credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:

```ini
IBM_API_KEY=<your IBM Cloud API key>
IBM_PROJECT_ID=<your Watsonx.ai project ID>
WATSONX_URL=https://us-south.ml.cloud.ibm.com   # change region if needed
FLASK_SECRET_KEY=<any long random string>
```

> **Where to get credentials:**
> 1. Log in at [cloud.ibm.com](https://cloud.ibm.com)
> 2. Go to **Manage → Access (IAM) → API keys** → create a key
> 3. Open **IBM watsonx.ai** → open your project → **Manage → General** → copy the Project ID

### 5. Run locally

```bash
python app.py
```

Open **http://localhost:5000** in your browser.

---

## 🎛️ Customising the Agent

All agent behaviour is controlled by the `AGENT_INSTRUCTIONS` block at the **top of `app.py`**:

```python
# ── AGENT INSTRUCTIONS  ← edit freely ─────────────────────────
AGENT_TONE            = "friendly and motivational"
AGENT_SPECIALIZATION  = "holistic nutrition, weight management, ..."
AGENT_LANGUAGE_HINT   = "Indian English"
AGENT_INDIAN_FOODS    = True      # set False to disable Indian food context
AGENT_MAX_CALORIES    = 2500      # default daily ceiling
AGENT_SAFETY_RULES    = [...]     # hard rules the model must follow
```

| Variable | What it does |
|---|---|
| `AGENT_TONE` | Sets the overall tone: `"professional"`, `"friendly"`, `"motivational"` |
| `AGENT_SPECIALIZATION` | Comma-separated list of diet expertise areas |
| `AGENT_LANGUAGE_HINT` | Language/regional flavour (e.g. `"British English"`) |
| `AGENT_INDIAN_FOODS` | `True` = include Indian recipes, fasting diets, regional thalis |
| `AGENT_MAX_CALORIES` | Default calorie ceiling injected into every meal plan |
| `AGENT_SAFETY_RULES` | List of rules the model must never violate |
| `AGENT_SYSTEM_PROMPT` | Fully assembled system prompt (auto-built, or replace entirely) |

---

## 🌐 API Reference

All endpoints accept/return JSON.

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/api/chat` | `{message, history, profile}` | `{reply, timestamp}` |
| `POST` | `/api/meal-plan` | `{goal, days, profile}` | `{plan}` |
| `POST` | `/api/analyze-meal` | `{meal}` | `{analysis}` |
| `POST` | `/api/bmi` | `{weight, height}` | `{bmi, category, advice}` |
| `POST` | `/api/tdee` | `{age, gender, weight, height, activity}` | `{tdee}` |
| `POST` | `/api/family-plan` | `{members:[...]}` | `{recommendations}` |
| `GET`  | `/api/health` | — | `{status, model, agent}` |

---

## ☁️ Deployment

### Option A — Gunicorn (Linux / Cloud VM)

```bash
gunicorn -w 2 -b 0.0.0.0:8080 app:app
```

### Option B — IBM Code Engine (Serverless)

```bash
# Build and push a container image
docker build -t nutribot:latest .
docker tag  nutribot:latest <your-registry>/nutribot:latest
docker push <your-registry>/nutribot:latest

# Deploy via IBM Cloud CLI
ibmcloud ce application create \
  --name nutribot \
  --image <your-registry>/nutribot:latest \
  --env-from-secret nutribot-secrets \
  --port 8080
```

Create a `Dockerfile` in the project root:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8080", "app:app"]
```

### Option C — Heroku / Render / Railway

```bash
# Heroku
heroku create my-nutribot
heroku config:set IBM_API_KEY=xxx IBM_PROJECT_ID=yyy FLASK_SECRET_KEY=zzz
git push heroku main
```

> ⚠️ **Never commit `.env` to version control.** Use platform secrets / env var settings.

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| `IBM_API_KEY is not set` error | Ensure `.env` exists and is loaded; check `IBM_API_KEY` spelling |
| `Model error: 401 Unauthorized` | Your API key may be invalid or expired — regenerate it |
| `Model error: 403 Forbidden` | Check your Watsonx.ai project ID and region URL |
| Charts don't appear | Ensure CDN URLs load (disable ad-blockers in dev) |
| Slow first response | First request builds the model client; subsequent calls are faster |

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `flask` | Web framework |
| `python-dotenv` | Load `.env` file |
| `ibm-watsonx-ai` | Official IBM Watsonx.ai SDK |
| `requests` | HTTP client (used by SDK) |
| `gunicorn` | Production WSGI server |

Frontend (CDN, no install needed):
- **Bootstrap 5.3** — UI framework
- **Bootstrap Icons 1.11** — icon set
- **Chart.js 4.4** — macro & weekly charts
- **Marked.js 12** — Markdown rendering in chat

---

## 🛡️ Security Notes

- API keys are loaded via `python-dotenv` from `.env` (never hardcoded)
- `.gitignore` excludes `.env` and `__pycache__`
- Chat history is stored in the browser's `localStorage` only
- No user data is persisted on the server between requests

---

## 📄 Licence

MIT — free to use, modify, and distribute.

---

<div align="center">Made with ❤️ using IBM Watsonx.ai Granite · NutriBot</div>
