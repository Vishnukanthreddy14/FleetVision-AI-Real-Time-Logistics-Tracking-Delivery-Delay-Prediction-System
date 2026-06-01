from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from backend.simulator import sim_engine
from backend.routes.auth import record_audit
from backend.security.session import decode_session

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

class SpeedRequest(BaseModel):
    multiplier: float

class IncidentRequest(BaseModel):
    vehicle_id: str
    incident_type: str = "Severe Traffic Jam"

def _get_request_user(request: Request) -> Dict[str, Any]:
    return decode_session(request.cookies.get("fleetvision_auth_user")) or {"name": "Unknown", "role": "unauthenticated"}

def _require_role(user: Dict[str, Any], roles: list):
    if user.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Access denied for this account role.")

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.post("/start")
def start_simulation(request: Request):
    user = _get_request_user(request)
    _require_role(user, ["admin", "super_admin"])
    client_ip = _get_client_ip(request)
    sim_engine.start()
    record_audit("SIMULATION_START", client_ip, user.get("name", "User"), "Simulation loop started", "INFO")
    return {"status": "started", "is_running": sim_engine.is_running}

@router.post("/pause")
def pause_simulation(request: Request):
    user = _get_request_user(request)
    _require_role(user, ["admin", "super_admin"])
    client_ip = _get_client_ip(request)
    sim_engine.pause()
    record_audit("SIMULATION_PAUSE", client_ip, user.get("name", "User"), "Simulation loop paused", "INFO")
    return {"status": "paused", "is_running": sim_engine.is_running}

@router.post("/reset")
def reset_simulation(request: Request):
    user = _get_request_user(request)
    client_ip = _get_client_ip(request)
    _require_role(user, ["super_admin"])
    sim_engine.reset()
    record_audit("SIMULATION_RESET", client_ip, user.get("name", "User"), "Simulation timeline reset to 00:00", "WARN")
    return {"status": "reset", "is_running": sim_engine.is_running}

@router.post("/speed")
def set_simulation_speed(req: SpeedRequest, request: Request):
    user = _get_request_user(request)
    client_ip = _get_client_ip(request)
    _require_role(user, ["admin", "super_admin"])
    sim_engine.set_speed(req.multiplier)
    record_audit("SIMULATION_SPEED", client_ip, user.get("name", "User"), f"Simulation speed changed to {req.multiplier}x", "INFO")
    return {"status": "success", "speed_multiplier": sim_engine.speed_multiplier}

@router.post("/incident")
def inject_incident(req: IncidentRequest, request: Request):
    user = _get_request_user(request)
    client_ip = _get_client_ip(request)
    role = user.get("role", "unauthenticated")
    if role not in ["admin", "super_admin"]:
        record_audit("ACCESS_DENIED", client_ip, user.get("name", "User"), f"Unauthorized attempt to inject incident for {req.vehicle_id}", "ALERT")
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Incident injection is restricted to administrators."
        )
    success = sim_engine.inject_incident(req.vehicle_id, req.incident_type)
    record_audit("INCIDENT_INJECTED", client_ip, user.get("name", "User"), f"Incident '{req.incident_type}' injected on {req.vehicle_id}", "ALERT")
    return {
        "status": "success" if success else "failed",
        "vehicle_id": req.vehicle_id,
        "incident_type": req.incident_type
    }


@router.get("/status")
def get_simulation_status():
    step = sim_engine.vehicles["TRK-101"].current_step if "TRK-101" in sim_engine.vehicles else 0
    total = sim_engine.vehicles["TRK-101"].total_steps if "TRK-101" in sim_engine.vehicles else 300
    return {
        "is_running": sim_engine.is_running,
        "speed_multiplier": sim_engine.speed_multiplier,
        "current_step": step,
        "total_steps": total,
        "progress_pct": round((step / max(1, total)) * 100.0, 1),
        "total_vehicles": len(sim_engine.vehicles)
    }

# Route reset and injection handlers confirmed
