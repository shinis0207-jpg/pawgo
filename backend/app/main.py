from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import (
    auth, pets, places, reviews, ai,
    correction_requests, admin_correction_requests,
    favorites, admin_places,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(pets.router, prefix=PREFIX)
app.include_router(places.router, prefix=PREFIX)
app.include_router(reviews.router, prefix=PREFIX)
app.include_router(ai.router, prefix=PREFIX)
app.include_router(correction_requests.router, prefix=PREFIX)
app.include_router(admin_correction_requests.router, prefix=PREFIX)
app.include_router(admin_places.router, prefix=PREFIX)
app.include_router(favorites.router, prefix=PREFIX)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.version}


# Static admin page — a single hand-rolled HTML/JS file, no framework, no
# CDN. Data APIs it calls (login, places search, admin PATCH) are already
# admin-gated server-side, so the page itself doesn't need its own auth
# guard — it just shows a login form and then a policy editor.
_ADMIN_HTML = Path(__file__).parent / "static" / "admin.html"


@app.get("/admin", include_in_schema=False)
async def admin_page():
    return FileResponse(_ADMIN_HTML, media_type="text/html; charset=utf-8")


@app.get("/")
async def root():
    return {"app": settings.app_name, "docs": "/docs"}
