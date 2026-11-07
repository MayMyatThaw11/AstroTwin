from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db as dbmod
from .environment import import_nasa, router as env_router
from .routes import health, router
from .seed import seed

ORIGINS = [f"http://{h}:{p}" for h in ("localhost", "127.0.0.1") for p in (5173, 5174, 4173)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = dbmod.connect()
    dbmod.init_db(conn)
    app.state.seed_result = seed(conn)  # idempotent
    app.state.nasa_result = import_nasa(conn)  # idempotent; skipped if the ZIP is absent
    app.state.conn = conn
    yield
    conn.close()


app = FastAPI(title="AstroTwin AI API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Content-Type", "Accept"], allow_credentials=False)
app.include_router(router, prefix="/api/v1")
app.include_router(env_router, prefix="/api/v1")
app.add_api_route("/health", health, methods=["GET"])
