"""
FleetVisionAI: Operational Analytics & Chart Data Endpoints
Aggregates real-time metrics, ML prediction comparisons, fuel efficiency, and risk alerts.
"""

from typing import Dict, Any, List
from fastapi import APIRouter
from backend.simulator import sim_engine
from backend.db.mongo import db_manager

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/overview")
def get_overview_metrics():
    vehicles = [v.to_dict() for v in sim_engine.vehicles.values()]
    total = len(vehicles)
    
    on_time = sum(1 for v in vehicles if v["delay_risk"] == "Low")
    moderate_risk = sum(1 for v in vehicles if v["delay_risk"] == "Moderate")
    high_risk = sum(1 for v in vehicles if v["delay_risk"] == "High")
    in_transit = sum(1 for v in vehicles if v["delivery_status"] in ["In Transit", "Delayed", "High Risk"])
    arrived = sum(1 for v in vehicles if v["delivery_status"] == "Arrived")
    
    avg_speed = sum(v["speed_kmh"] for v in vehicles) / max(1, total)
    avg_fuel_rate = sum(v["fuel_consumption_rate"] for v in vehicles) / max(1, total)
    avg_eta = sum(v["estimated_arrival_time_min"] for v in vehicles) / max(1, total)
    total_km_remaining = sum(v["distance_remaining_km"] for v in vehicles)
    
    # Calculate efficiency score (100 is ideal, penalized by high fuel and severe congestion)
    congestion_penalty = (moderate_risk * 5) + (high_risk * 15)
    efficiency_score = max(55.0, min(99.0, 98.0 - (avg_fuel_rate - 26.0) * 1.5 - congestion_penalty))

    return {
        "total_vehicles": total,
        "in_transit": in_transit,
        "arrived": arrived,
        "on_time_count": on_time,
        "on_time_rate_pct": round((on_time / max(1, total)) * 100.0, 1),
        "moderate_risk_count": moderate_risk,
        "high_risk_count": high_risk,
        "avg_speed_kmh": round(avg_speed, 1),
        "avg_fuel_rate": round(avg_fuel_rate, 2),
        "avg_eta_min": round(avg_eta, 1),
        "total_km_remaining": round(total_km_remaining, 1),
        "fleet_efficiency_score": round(efficiency_score, 1),
        "mongo_connected": db_manager.is_connected_to_mongo
    }

@router.get("/charts")
def get_charts_data():
    vehicles = [v.to_dict() for v in sim_engine.vehicles.values()]
    
    # Sort by vehicle ID for consistent chart ordering
    vehicles.sort(key=lambda x: x["vehicle_id"])
    
    labels = [v["vehicle_id"] for v in vehicles]
    
    # 1. ETA Comparison: Random Forest vs LSTM vs Blended
    rf_etas = [v["rf_eta_min"] for v in vehicles]
    lstm_etas = [v["lstm_eta_min"] for v in vehicles]
    blended_etas = [v["estimated_arrival_time_min"] for v in vehicles]
    
    # 2. Fuel & Speed Telemetry
    fuel_rates = [v["fuel_consumption_rate"] for v in vehicles]
    fuel_levels = [v["fuel_level_pct"] for v in vehicles]
    speeds = [v["speed_kmh"] for v in vehicles]
    
    # 3. Risk breakdown counts
    risk_counts = {"Low": 0, "Moderate": 0, "High": 0}
    for v in vehicles:
        risk = v.get("delay_risk", "Low")
        risk_counts[risk] = risk_counts.get(risk, 0) + 1
        
    # 4. Traffic breakdown counts
    traffic_counts = {"Low": 0, "Moderate": 0, "High": 0, "Severe": 0}
    for v in vehicles:
        t = v.get("traffic_congestion", "Low")
        traffic_counts[t] = traffic_counts.get(t, 0) + 1

    return {
        "labels": labels,
        "eta_comparison": {
            "labels": labels,
            "random_forest": rf_etas,
            "lstm": lstm_etas,
            "blended": blended_etas
        },
        "fuel_telemetry": {
            "labels": labels,
            "fuel_rate": fuel_rates,
            "fuel_level": fuel_levels
        },
        "speed_telemetry": {
            "labels": labels,
            "speeds": speeds
        },
        "risk_distribution": {
            "labels": ["Low Risk (On Schedule)", "Moderate Risk (Watch)", "High Risk (Delayed)"],
            "data": [risk_counts["Low"], risk_counts["Moderate"], risk_counts["High"]]
        },
        "traffic_distribution": {
            "labels": ["Clear / Low", "Moderate", "High Congestion", "Severe Bottleneck"],
            "data": [traffic_counts["Low"], traffic_counts["Moderate"], traffic_counts["High"], traffic_counts["Severe"]]
        }
    }

@router.get("/alerts")
def get_alerts():
    """Returns active alerts list from database and active vehicle alerts."""
    alerts = []
    
    # Check vehicles with high risk or incidents
    for v in sim_engine.vehicles.values():
        if v.active_incident or v.delay_risk == "High":
            alerts.append({
                "vehicle_id": v.vehicle_id,
                "driver_name": v.driver_name,
                "incident": v.active_incident or "High Delay Risk Detected by ML Models",
                "severity": "CRITICAL" if v.active_incident else "WARNING",
                "delay_delta_min": v.delay_delta_min,
                "location": f"Lat {v.latitude}, Lon {v.longitude}",
                "traffic": v.traffic_congestion,
                "weather": v.weather_condition,
                "eta_min": v.blended_eta_min,
                "created_at": v.to_dict()["updated_at"]
            })
            
    # Also fetch recent from MongoDB
    try:
        mongo_alerts = list(db_manager.alerts.find(sort=[("created_at", -1)], limit=15))
        for ma in mongo_alerts:
            if "_id" in ma:
                ma["_id"] = str(ma["_id"])
            if not any(a["vehicle_id"] == ma.get("vehicle_id") and a.get("incident") == ma.get("incident_type") for a in alerts):
                alerts.append({
                    "vehicle_id": ma.get("vehicle_id", "TRK-SYS"),
                    "driver_name": ma.get("driver_name", "Fleet Operator"),
                    "incident": ma.get("incident_type", "System Notice"),
                    "severity": ma.get("severity", "INFO"),
                    "created_at": ma.get("created_at", "")
                })
    except Exception:
        pass
        
    return alerts
