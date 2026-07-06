"""
FleetVisionAI: Main FastAPI Application Entrypoint
Integrates REST APIs, WebSocket live telemetry streaming, static asset serving,
and initiates background simulation loops.
"""

import asyncio
import os
import logging
import json
import urllib.parse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.config import APP_TITLE
from backend.simulator import sim_engine
from backend.routes.auth import router as auth_router, get_audit_logs
from backend.routes.vehicles import router as vehicles_router
from backend.routes.analytics import router as analytics_router
from backend.routes.simulation_api import router as simulation_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("fleetvision.main")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app = FastAPI(
    title=APP_TITLE,
    description="Real-Time Logistics Tracking, Fuel Telemetry & Delivery Delay Prediction System with dual Random Forest and LSTM algorithms.",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security & Cache Control Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Register routers
app.include_router(auth_router)
app.include_router(vehicles_router)
app.include_router(analytics_router)
app.include_router(simulation_router)

# Compatibility alias for audit logs
@app.get("/api/audit-logs")
def audit_logs_alias(limit: int = 50):
    return get_audit_logs(limit=limit)


# Mount static frontend directories
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
def launch_root(request: Request):
    """
    Launch Page: Serves the 3D Interactive Login Portal as the primary entrypoint.
    If the user has an active authenticated session, seamlessly redirects to /dashboard.
    """
    auth_cookie = request.cookies.get("fleetvision_auth_user")
    if auth_cookie:
        try:
            user = json.loads(urllib.parse.unquote(auth_cookie))
            if user and user.get("role"):
                return RedirectResponse(url="/dashboard", status_code=302)
        except Exception:
            pass
    return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))

@app.get("/login")
def serve_login(request: Request):
    """Serves the FleetVisionAI 3D Interactive Login Portal."""
    return FileResponse(os.path.join(FRONTEND_DIR, "login.html"))

@app.get("/dashboard")
def serve_dashboard(request: Request):
    """
    Serves the FleetVisionAI Operations Dashboard strictly to authenticated users.
    Unauthenticated attempts are denied and redirected to /login with denied=true.
    """
    auth_cookie = request.cookies.get("fleetvision_auth_user")
    if not auth_cookie:
        return RedirectResponse(url="/login?denied=true", status_code=302)
    try:
        user = json.loads(urllib.parse.unquote(auth_cookie))
        if not user or not user.get("role"):
            return RedirectResponse(url="/login?denied=true", status_code=302)
    except Exception:
        return RedirectResponse(url="/login?denied=true", status_code=302)

    return FileResponse(os.path.join(FRONTEND_DIR, "dashboard.html"))

@app.get("/showcase")
@app.get("/landing")
def serve_showcase():
    """Serves the FleetVisionAI Marketing & Fleet Overview Showcase."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": "FleetVisionAI",
        "total_vehicles": len(sim_engine.vehicles),
        "is_simulation_running": sim_engine.is_running,
        "speed_multiplier": sim_engine.speed_multiplier
    }

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """High-frequency real-time telemetry streaming channel."""
    await sim_engine.register_websocket(websocket)
    try:
        while True:
            # Keep connection alive; client can send control commands if desired
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        sim_engine.unregister_websocket(websocket)
    except Exception as e:
        logger.warning("WebSocket client closed: %s", e)
        sim_engine.unregister_websocket(websocket)

@app.on_event("startup")
async def startup_event():
    """Starts the simulation engine tick loop in the background."""
    logger.info("Starting FleetVisionAI Simulation Engine background loop...")
    asyncio.create_task(sim_engine.run_loop())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
