# ARGUS Deployment Guide
## Local (Docker Compose) + Render (backend) + Vercel (dashboard)

---

## Part 1 — Local one-command startup

Copy these files into your `aml-api/` project root:
- `docker-compose.yml`
- `Dockerfile`
- `start.sh`

```bash
# Build the image (once, or after code changes)
docker compose build

# Start Redis + Postgres + API + Worker
docker compose up

# Background mode
docker compose up -d

# Check all services
docker compose ps

# View logs
docker compose logs -f api
docker compose logs -f worker

# Stop everything
docker compose down

# Full reset (wipes Postgres data)
docker compose down -v
```

Dashboard runs separately:
```bash
cd aml-dashboard && npm run dev
# Open http://localhost:5173
```

Health check:
```bash
curl http://localhost:8000/health
# Expect: models_loaded:true, neo4j_connected:true, postgres_connected:true
```

---

## Part 2 — Push to GitHub

```bash
cd aml-api
git init
git add .
git commit -m "initial: ARGUS AML system"
git remote add origin https://github.com/YOUR_USERNAME/argus-aml.git
git push -u origin main
```

`.gitignore` already excludes `.env` and model files.
Never push credentials or `app/models/*.pkl`/`*.pt`/`*.csv` to GitHub.

For the dashboard (separate repo is simplest for Vercel):
```bash
cd aml-dashboard
git init && git add . && git commit -m "initial: ARGUS dashboard"
git remote add origin https://github.com/YOUR_USERNAME/argus-dashboard.git
git push -u origin main
```

---

## Part 3 — Render Backend Deployment

### Why start.sh exists
Render's free tier only allows one web service — background worker services
cost money. `start.sh` runs both the FastAPI server AND the Celery worker
inside one process using `&` (background process). If either dies, the
script exits and Render auto-restarts the whole service.

This is a free-tier workaround. On local Docker Compose or a paid Render
plan, they run as proper separate services (better isolation, separate
restarts, separate logs).

### 3A. Deploy via Blueprint

1. Place `render.yaml`, `Dockerfile`, and `start.sh` in your `aml-api` repo root
2. Go to https://dashboard.render.com → New → Blueprint
3. Connect your `argus-aml` GitHub repo
4. Blueprint name: `argus`
5. Branch: `main`
6. Click Apply

Render creates: one web service (API + worker via start.sh), one Postgres
database, one Redis instance.

### 3B. Set secret environment variables

After blueprint deploys, go to `argus-api` service → Environment, and
manually add these three — never put real credentials in render.yaml:

```
NEO4J_URI      = neo4j+s://your-aura-id.databases.neo4j.io
NEO4J_USERNAME = neo4j
NEO4J_PASSWORD = your-aura-password
```

Click Save Changes — Render will auto-redeploy.

### 3C. Upload model files

Free tier has no persistent disk. Model files need to be loaded at startup.

**Option A (recommended for demo): Bundle into the Docker image**

Add to your `Dockerfile` before the `EXPOSE` line:
```dockerfile
COPY app/models/rf_model.pkl ./app/models/rf_model.pkl
COPY app/models/graphsage_weights.pt ./app/models/graphsage_weights.pt
COPY app/models/account_level_features.csv ./app/models/account_level_features.csv
COPY app/models/edge_list.csv ./app/models/edge_list.csv
```

Then push to GitHub — Render rebuilds with the files baked in.
Note: this makes your image larger but works on free tier with no extra steps.

**Option B: Load from Google Drive at startup**

Add a startup script that downloads from a public Drive share link.
Ask for this if needed — adds ~60 seconds to cold-start but avoids
large images.

### 3D. Verify
```bash
curl https://argus-api.onrender.com/health
```

**Expected cold-start time**: 30-60 seconds on free tier (Render spins down
after 15 minutes of inactivity). This is normal behavior, not a bug.

---

## Part 4 — Vercel Dashboard Deployment

### 4A. Deploy

1. Go to https://vercel.com → Add New → Project
2. Import your `argus-dashboard` GitHub repo
3. Framework: Vite (auto-detected)
4. Add environment variable:
   ```
   VITE_API_BASE = https://argus-api.onrender.com
   ```
5. Click Deploy

### 4B. Update CORS in the API

Once Vercel gives you your URL (e.g. `https://argus-dashboard.vercel.app`),
open `app/main.py` and update the `allow_origins` list (see `cors_snippet.py`):

```python
allow_origins=[
    "http://localhost:5173",
    "https://argus-dashboard.vercel.app",   # ← your actual Vercel URL
]
```

Push to GitHub → Render auto-redeploys.

### 4C. Verify
Open your Vercel URL. Alert Queue should load within ~60 seconds on first
visit (Render cold-start). Subsequent visits are fast.

---

## Part 5 — GitHub Actions CI

`.github/workflows/ci.yml` runs on every push to `main` or PR:

- **Backend job**: ruff lint + import check (no live connections needed)
- **Frontend job**: `npm ci` + `npm run build`
- **Docker job**: full image build check

No additional setup needed — it uses GitHub's free Actions minutes.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `models_loaded: false` | Model files missing | Bundle into Dockerfile (Option A above) |
| `neo4j_connected: false` | NEO4J_* not set | Check Render environment tab |
| Alert Queue blank on Vercel | CORS missing | Add Vercel URL to `allow_origins` |
| Blueprint validation errors | render.yaml syntax | Ensure `dockerCommand` not `startCommand` for docker runtime |
| Worker not processing tasks | Redis URL wrong | Verify `REDIS_URL` env var in Render service |
| Render cold-start 30-60s | Free tier spin-down | Expected — or upgrade to Starter ($7/mo) |
| `npm run build` fails on Vercel | Wrong root directory | Set root to `aml-dashboard` in Vercel project settings |
