import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.scoring_service import ScoringService
from app.services.neo4j_service import Neo4jService
from app.services.case_service import CaseService
from app.services.evidence_service import EvidenceService
from app.services.sar_service import SARService
from app.routers import scoring, graph, cases, sar
from app.routers import scoring, graph, cases, sar, transactions
from fastapi.middleware.cors import CORSMiddleware

# ...
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting AML Risk Scoring API...")

    app.state.scoring_service = ScoringService(models_dir=MODELS_DIR, device="cpu")

    try:
        app.state.neo4j_service = Neo4jService()
    except RuntimeError as e:
        print(f"[WARNING] Neo4j connection not established: {e}")
        app.state.neo4j_service = None

    try:
        app.state.case_service = CaseService()
    except Exception as e:
        print(f"[WARNING] PostgreSQL connection not established: {e}")
        app.state.case_service = None

    if app.state.case_service is not None:
        app.state.evidence_service = EvidenceService(
            app.state.scoring_service, app.state.neo4j_service, app.state.case_service
        )
        app.state.sar_service = SARService()
    else:
        print("[WARNING] SAR generation unavailable without case_service.")
        app.state.evidence_service = None
        app.state.sar_service = None

    print("Startup complete.")
    yield

    if app.state.neo4j_service is not None:
        app.state.neo4j_service.close()
    if app.state.case_service is not None:
        app.state.case_service.close()
    print("Shutting down.")


app = FastAPI(title="AML Risk Scoring API", version="1.3.0", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",                  # local dev
        "https://argus-aml.vercel.app",     # replace with your Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions.router)
app.include_router(scoring.router)
app.include_router(graph.router)
app.include_router(cases.router)
app.include_router(sar.router)


@app.get("/")
def root():
    return {"service": "AML Risk Scoring API", "status": "running", "docs": "/docs"}


@app.get("/health")
def health_check():
    return {
        "status": "healthy" if hasattr(app.state, "scoring_service") else "not ready",
        "models_loaded": hasattr(app.state, "scoring_service"),
        "neo4j_connected": getattr(app.state, "neo4j_service", None) is not None,
        "postgres_connected": getattr(app.state, "case_service", None) is not None,
        "sar_ready": getattr(app.state, "sar_service", None) is not None,
    }