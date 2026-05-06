from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import engine, Base
from app.routers import auth, pets, places, reviews, ai

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


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.version}


@app.get("/")
async def root():
    return {"app": settings.app_name, "docs": "/docs"}
