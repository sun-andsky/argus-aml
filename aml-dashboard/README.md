# AML Alert Queue — Investigator Dashboard

Week 9 deliverable: the alert queue, the primary view an investigator opens
first each day.

## Design approach

Built as an **audit ledger**, not a generic SaaS admin panel — dense,
precise, and quiet, with color spent only on risk signal:

- **Paper-gray background, ink text, institutional navy accent** — no
  cream/terracotta, no dark-mode-neon, no hairline-broadsheet defaults.
- **IBM Plex Mono for every account ID, score, and timestamp** — signals
  "this is precise ledger data," distinct from the Inter UI chrome and the
  IBM Plex Serif headers.
- **Signature element: the ledger tally bar** (`RiskBar.jsx`) — a ruled,
  tick-marked risk meter standing in for generic colored status badges.

## Setup

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`. By default it talks to the FastAPI backend
at `http://127.0.0.1:8000` — override with a `.env` file:

```
VITE_API_BASE=http://127.0.0.1:8000
```

## What's built vs. what's next

**Built:** Alert Queue (`AlertQueue.jsx`) — tier summary strip, sortable/
filterable ledger table, quick-clear action, empty/loading/error states.

**Not yet built** (stubbed in the sidebar): Case Detail view, Graph Explorer
(Cytoscape.js), SAR Reports list. These are the rest of Week 9–10's scope —
say the word and they're next.

## Backend requirement

The queue reads from `GET /cases` (Week 7's case management endpoint) —
make sure the FastAPI server is running with CORS enabled for
`http://localhost:5173`, or requests will be blocked by the browser.
Add this to `app/main.py` if not already present:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
