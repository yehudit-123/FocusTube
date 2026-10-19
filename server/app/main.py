"""FocusTube Backend API - FastAPI Application Entry Point.
Provides RESTful APIs for video transcription, concentration monitoring, question generation, and classrooms.
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from server.app.config import settings
from server.app.database import connect_db, close_db
from server.app.routers import auth, users, content, videos, sessions, classes

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("FocusTube")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Check GEMINI_API_KEY on startup
    if not settings.gemini_api_key:
        logger.warning("WARNING: GEMINI_API_KEY is empty or not configured. AI question generation will be disabled until a valid key is provided.")
    else:
        logger.info("GEMINI_API_KEY is configured.")

    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="FocusTube API",
    description="Backend service for FocusTube attention-monitoring learning environment",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from client container and dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Formats validation errors cleanly with status 422 as required."""
    errors = exc.errors()
    msg = "שגיאה בנתונים שהוזנו: " + ", ".join(e.get("msg", "") for e in errors)
    return JSONResponse(
        status_code=422,
        content={"message": msg, "details": errors}
    )


@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint. Always returns 200 with status ok even if GEMINI_API_KEY is missing."""
    return {"status": "ok"}


# Include API Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(content.router)
app.include_router(videos.router)
app.include_router(sessions.router)
app.include_router(classes.router)
