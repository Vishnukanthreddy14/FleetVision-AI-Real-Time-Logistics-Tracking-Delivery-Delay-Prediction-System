"""
FleetVisionAI: Real-Time Telemetry Stream & 5-Minute Simulation Engine
Simulates 14 commercial vehicles traversing distinct freight corridors,
streaming continuous GPS telemetry, dynamic traffic, fuel burn, and
dual-model ML predictions into MongoDB and live WebSockets.
"""

import asyncio
import json
import logging
import os
import random
import math
from datetime import datetime, timedelta
from typing import Dict, List, Any, Set
from fastapi import WebSocket


try:
    from geopy.distance import geodesic
    def distance_km(p1: List[float], p2: List[float]) -> float:
        return geodesic(p1, p2).km
except ImportError:
    def distance_km(p1: List[float], p2: List[float]) -> float:
        lat1, lon1 = math.radians(p1[0]), math.radians(p1[1])
        lat2, lon2 = math.radians(p2[0]), math.radians(p2[1])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return 6371.0 * c

from backend.config import FIVE_MINUTE_TICKS
from backend.db.mongo import db_manager, seed_initial_vehicles
from ml.inference import ml_engine

logger = logging.getLogger("fleetvision.simulator")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "data", "routes_config.json")

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate compass heading angle in degrees (0-360) between two GPS points."""
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    initial_bearing = math.atan2(y, x)
    initial_bearing = math.degrees(initial_bearing)
    compass_bearing = (initial_bearing + 360) % 360
    return round(compass_bearing, 1)

def interpolate(p1: List[float], p2: List[float], fraction: float) -> List[float]:
    lat = p1[0] + (p2[0] - p1[0]) * fraction
    lon = p1[1] + (p2[1] - p1[1]) * fraction
    return [round(lat, 5), round(lon, 5)]

def calculate_route_metrics(waypoints: List[List[float]]) -> List[float]:
    """Returns cumulative segment distances in kilometers."""
    cum_dists = [0.0]
    for i in range(len(waypoints) - 1):
        seg = distance_km(waypoints[i], waypoints[i+1])
        cum_dists.append(cum_dists[-1] + seg)
    return cum_dists


class VehicleSimulator:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.vehicle_id = config["vehicle_id"]
        self.driver_id = config["driver_id"]
        self.driver_name = config["driver_name"]
        self.vehicle_type = config["type"]
        self.route_name = config["route_name"]
        self.origin = config["origin"]
        self.destination = config["destination"]
        self.waypoints = config["waypoints"]
        self.cumulative_distances = calculate_route_metrics(self.waypoints)
        self.total_route_distance_km = self.cumulative_distances[-1]
        
        # State variables
        self.current_step = 0
        self.total_steps = FIVE_MINUTE_TICKS  # 300 steps
        self.latitude = self.waypoints[0][0]
        self.longitude = self.waypoints[0][1]
        self.bearing = calculate_bearing(self.waypoints[0][0], self.waypoints[0][1], self.waypoints[1][0], self.waypoints[1][1]) if len(self.waypoints) > 1 else 0.0
        self.speed_kmh = 75.0
        self.fuel_level_pct = 98.0
        self.fuel_consumption_rate = config["base_fuel_rate"]
        self.traffic_congestion = "Low"
        self.weather_condition = "Clear"
        self.delivery_status = "In Transit"
        self.distance_remaining_km = self.total_route_distance_km
        self.trip_progress_pct = 0.0
        self.active_incident = None
        self.trail_history: List[List[float]] = [[self.latitude, self.longitude]]
        
        # ML outputs
        self.rf_eta_min = 180.0
        self.lstm_eta_min = 180.0
        self.blended_eta_min = 180.0
        self.delay_risk = "Low"
        self.delay_delta_min = 0.0
        self.optimization = {}

    def reset(self):
        self.current_step = 0
        self.latitude = self.waypoints[0][0]
        self.longitude = self.waypoints[0][1]
        self.speed_kmh = 75.0
        self.fuel_level_pct = 98.0
        self.traffic_congestion = "Low"
        self.weather_condition = "Clear"
        self.delivery_status = "In Transit"
        self.distance_remaining_km = self.total_route_distance_km
        self.trip_progress_pct = 0.0
        self.active_incident = None
        self.trail_history = [[self.latitude, self.longitude]]

    def inject_incident(self, incident_type: str = "Severe Traffic Jam"):
        self.active_incident = incident_type
        if "Traffic" in incident_type:
            self.traffic_congestion = "Severe"
            self.speed_kmh = max(18.0, self.speed_kmh * 0.35)
        elif "Storm" in incident_type or "Weather" in incident_type:
            self.weather_condition = "Snow"
            self.speed_kmh = max(25.0, self.speed_kmh * 0.5)
        elif "Engine" in incident_type:
            self.speed_kmh = 20.0
            self.fuel_consumption_rate *= 1.45

    def step(self):
        if self.current_step >= self.total_steps:
            # Seamless loop: start fresh along Indian corridor
            self.current_step = 0
            self.latitude = self.waypoints[0][0]
            self.longitude = self.waypoints[0][1]
            self.fuel_level_pct = 98.0
            self.active_incident = None
            self.trail_history = [[self.latitude, self.longitude]]
            if len(self.waypoints) > 1:
                self.bearing = calculate_bearing(self.waypoints[0][0], self.waypoints[0][1], self.waypoints[1][0], self.waypoints[1][1])

        prev_lat, prev_lon = self.latitude, self.longitude
        self.current_step += 1
        progress = self.current_step / self.total_steps
        self.trip_progress_pct = round(progress * 100.0, 1)
        
        # Calculate current position along route
        target_dist = self.total_route_distance_km * progress
        for i in range(len(self.cumulative_distances) - 1):
            d_start = self.cumulative_distances[i]
            d_end = self.cumulative_distances[i+1]
            if d_start <= target_dist <= d_end or i == len(self.cumulative_distances) - 2:
                seg_len = max(0.001, d_end - d_start)
                fraction = (target_dist - d_start) / seg_len
                fraction = max(0.0, min(1.0, fraction))
                self.latitude, self.longitude = interpolate(self.waypoints[i], self.waypoints[i+1], fraction)
                break
                
        self.distance_remaining_km = round(max(0.0, self.total_route_distance_km - target_dist), 1)

        # Update bearing if moved
        if (self.latitude, self.longitude) != (prev_lat, prev_lon):
            self.bearing = calculate_bearing(prev_lat, prev_lon, self.latitude, self.longitude)
        
        # Append to glowing trail (keep last 35 points for visual performance)
        self.trail_history.append([self.latitude, self.longitude])
        if len(self.trail_history) > 35:
            self.trail_history.pop(0)

        # Dynamic adjustments
        if not self.active_incident:
            # Ambient conditions along route
            if 0.35 <= progress <= 0.55 and int(self.vehicle_id[-2:]) % 3 == 0:
                self.traffic_congestion = "High"
                base_speed = 45.0
            elif 0.70 <= progress <= 0.85 and int(self.vehicle_id[-2:]) % 4 == 0:
                self.traffic_congestion = "Moderate"
                base_speed = 60.0
            else:
                self.traffic_congestion = "Low"
                base_speed = 88.0
        else:
            base_speed = 30.0

        noise = random.uniform(-4.0, 4.0)
        self.speed_kmh = round(max(15.0, min(110.0, base_speed + noise)), 1)
        
        # Fuel consumption
        traffic_mult = {"Low": 1.0, "Moderate": 1.25, "High": 1.55, "Severe": 2.1}[self.traffic_congestion]
        self.fuel_consumption_rate = round(self.config["base_fuel_rate"] * traffic_mult + random.uniform(-0.8, 0.8), 2)
        self.fuel_level_pct = round(max(5.0, 98.0 - (progress * 55.0)), 1)
        
        # ML Inference calculation
        telemetry_packet = {
            "speed_kmh": self.speed_kmh,
            "distance_remaining_km": self.distance_remaining_km,
            "fuel_consumption_rate": self.fuel_consumption_rate,
            "fuel_level_pct": self.fuel_level_pct,
            "trip_progress_pct": self.trip_progress_pct,
            "traffic_congestion": self.traffic_congestion,
            "weather_condition": self.weather_condition
        }
        
        preds = ml_engine.predict_telemetry(self.vehicle_id, telemetry_packet)
        self.rf_eta_min = preds["rf_estimated_arrival_min"]
        self.lstm_eta_min = preds["lstm_estimated_arrival_min"]
        self.blended_eta_min = preds["blended_eta_min"]
        self.delay_risk = preds["delay_risk"]
        self.delay_delta_min = preds["delay_delta_min"]
        self.optimization = preds["optimization"]

        # Status update
        if self.delay_risk == "High" or self.active_incident:
            self.delivery_status = "High Risk" if self.speed_kmh > 35 else "Delayed"
        else:
            self.delivery_status = "In Transit"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "vehicle_id": self.vehicle_id,
            "driver_id": self.driver_id,
            "driver_name": self.driver_name,
            "vehicle_type": self.vehicle_type,
            "plate": self.config["plate"],
            "route_name": self.route_name,
            "origin": self.origin,
            "destination": self.destination,
            "waypoints": self.waypoints,
            "current_location": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "trail_history": self.trail_history,
            "speed_kmh": self.speed_kmh,
            "fuel_level_pct": self.fuel_level_pct,
            "fuel_consumption_rate": self.fuel_consumption_rate,
            "traffic_congestion": self.traffic_congestion,
            "bearing": self.bearing,
            "weather_condition": self.weather_condition,
            "delivery_status": self.delivery_status,
            "distance_remaining_km": self.distance_remaining_km,
            "total_route_distance_km": round(self.total_route_distance_km, 1),
            "trip_progress_pct": self.trip_progress_pct,
            "estimated_arrival_time_min": self.blended_eta_min,
            "rf_eta_min": self.rf_eta_min,
            "lstm_eta_min": self.lstm_eta_min,
            "delay_delta_min": self.delay_delta_min,
            "delay_risk": self.delay_risk,
            "active_incident": self.active_incident,
            "optimization": self.optimization,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "updated_at": datetime.utcnow().isoformat()
        }

class FleetSimulationEngine:
    def __init__(self):
        self.vehicles: Dict[str, VehicleSimulator] = {}
        self.is_running: bool = True
        self.speed_multiplier: float = 1.0
        self.active_websockets: Set[WebSocket] = set()
        self._task: Optional[asyncio.Task] = None
        self.init_vehicles()

    def init_vehicles(self):
        with open(CONFIG_PATH, "r") as f:
            data = json.load(f)
        for cfg in data["vehicles"]:
            self.vehicles[cfg["vehicle_id"]] = VehicleSimulator(cfg)
        logger.info("FleetSimulationEngine initialized %d vehicles.", len(self.vehicles))
        seed_initial_vehicles()

    def start(self):
        if not self.is_running:
            self.is_running = True
            logger.info("Fleet simulation started.")

    def pause(self):
        self.is_running = False
        logger.info("Fleet simulation paused.")

    def reset(self):
        self.is_running = False
        for v in self.vehicles.values():
            v.reset()
        logger.info("Fleet simulation reset to initial state.")

    def set_speed(self, multiplier: float):
        self.speed_multiplier = max(0.5, min(10.0, multiplier))
        logger.info("Simulation speed multiplier set to %.1fx", self.speed_multiplier)

    def inject_incident(self, vehicle_id: str, incident_type: str = "Severe Traffic Jam"):
        if vehicle_id in self.vehicles:
            self.vehicles[vehicle_id].inject_incident(incident_type)
            # Record alert in MongoDB
            alert_doc = {
                "vehicle_id": vehicle_id,
                "driver_id": self.vehicles[vehicle_id].driver_id,
                "driver_name": self.vehicles[vehicle_id].driver_name,
                "incident_type": incident_type,
                "location": {
                    "latitude": self.vehicles[vehicle_id].latitude,
                    "longitude": self.vehicles[vehicle_id].longitude
                },
                "severity": "CRITICAL" if "Severe" in incident_type else "WARNING",
                "created_at": datetime.utcnow().isoformat(),
                "status": "Active"
            }
            db_manager.alerts.insert_one(alert_doc)
            logger.info("Injected incident '%s' on vehicle %s", incident_type, vehicle_id)
            return True
        return False

    async def register_websocket(self, websocket: WebSocket):
        await websocket.accept()
        self.active_websockets.add(websocket)
        # Send immediate initial state
        await websocket.send_json(self.get_telemetry_snapshot())

    def unregister_websocket(self, websocket: WebSocket):
        self.active_websockets.discard(websocket)

    def get_telemetry_snapshot(self) -> Dict[str, Any]:
        vehicles_data = [v.to_dict() for v in self.vehicles.values()]
        
        # Calculate aggregate analytics
        total = len(vehicles_data)
        on_time = sum(1 for v in vehicles_data if v["delay_risk"] == "Low")
        delayed = sum(1 for v in vehicles_data if v["delay_risk"] == "High" or v["delivery_status"] == "Delayed")
        in_transit = sum(1 for v in vehicles_data if v["delivery_status"] in ["In Transit", "High Risk", "Delayed"])
        avg_speed = sum(v["speed_kmh"] for v in vehicles_data) / max(1, total)
        avg_fuel_rate = sum(v["fuel_consumption_rate"] for v in vehicles_data) / max(1, total)
        avg_eta = sum(v["estimated_arrival_time_min"] for v in vehicles_data) / max(1, total)
        
        return {
            "type": "telemetry_update",
            "timestamp": datetime.utcnow().isoformat(),
            "simulation": {
                "is_running": self.is_running,
                "speed_multiplier": self.speed_multiplier,
                "current_step": self.vehicles["TRK-101"].current_step if "TRK-101" in self.vehicles else 0,
                "total_steps": FIVE_MINUTE_TICKS
            },
            "kpi": {
                "total_vehicles": total,
                "in_transit": in_transit,
                "on_time_count": on_time,
                "on_time_rate_pct": round((on_time / max(1, total)) * 100.0, 1),
                "delayed_count": delayed,
                "avg_speed_kmh": round(avg_speed, 1),
                "avg_fuel_rate": round(avg_fuel_rate, 2),
                "avg_eta_min": round(avg_eta, 1)
            },
            "vehicles": vehicles_data
        }

    async def run_loop(self):
        """Continuous background tick loop."""
        while True:
            try:
                if self.is_running:
                    # Advance all vehicles one step
                    telemetry_docs = []
                    for v in self.vehicles.values():
                        v.step()
                        v_data = v.to_dict()
                        
                        # Prepare batch telemetry for MongoDB
                        telemetry_docs.append({
                            "vehicle_id": v.vehicle_id,
                            "timestamp": v_data["updated_at"],
                            "latitude": v.latitude,
                            "longitude": v.longitude,
                            "speed_kmh": v.speed_kmh,
                            "fuel_consumption_rate": v.fuel_consumption_rate,
                            "fuel_level_pct": v.fuel_level_pct,
                            "traffic_congestion": v.traffic_congestion,
                            "weather_condition": v.weather_condition,
                            "delivery_status": v.delivery_status,
                            "distance_remaining_km": v.distance_remaining_km,
                            "trip_progress_pct": v.trip_progress_pct,
                            "estimated_arrival_time_min": v.blended_eta_min,
                            "rf_eta_min": v.rf_eta_min,
                            "lstm_eta_min": v.lstm_eta_min,
                            "delay_risk": v.delay_risk
                        })
                        
                        # Update current vehicle document in MongoDB
                        db_manager.vehicles.update_one(
                            {"vehicle_id": v.vehicle_id},
                            {"$set": v_data},
                            upsert=True
                        )

                    # Ingest to MongoDB telemetry history
                    if telemetry_docs:
                        try:
                            db_manager.telemetry_history.insert_many(telemetry_docs)
                        except Exception as e:
                            logger.warning("Telemetry history write error: %s", e)

                    # Broadcast to WebSockets
                    snapshot = self.get_telemetry_snapshot()
                    disconnected = []
                    for ws in list(self.active_websockets):
                        try:
                            await ws.send_json(snapshot)
                        except Exception:
                            disconnected.append(ws)
                    for dead_ws in disconnected:
                        self.unregister_websocket(dead_ws)

                # Sleep interval based on speed multiplier (1s at 1x, 0.5s at 2x, 0.2s at 5x)
                interval = max(0.1, 1.0 / self.speed_multiplier)
                await asyncio.sleep(interval)
            except Exception as e:
                logger.error("Simulation loop error: %s", e)
                await asyncio.sleep(1.0)

# Global simulation singleton
sim_engine = FleetSimulationEngine()
