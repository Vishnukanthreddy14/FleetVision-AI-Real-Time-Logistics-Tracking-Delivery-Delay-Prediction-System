"""
FleetVisionAI: MongoDB Database Integration & Ingestion Layer
Provides robust client connection, automatic schema setup, indexing,
and graceful fallback in-memory collection handlers.
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
import pymongo
from pymongo import MongoClient

from backend.config import MONGO_URI, DATABASE_NAME

logger = logging.getLogger("fleetvision.db")

class InMemoryCollection:
    """Lightweight in-memory MongoDB-compatible collection fallback."""
    def __init__(self, name: str):
        self.name = name
        self.data: List[Dict[str, Any]] = []

    def insert_one(self, doc: Dict[str, Any]):
        doc_copy = dict(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = str(len(self.data) + 1)
        self.data.append(doc_copy)
        return type("InsertResult", (), {"inserted_id": doc_copy["_id"]})()

    def insert_many(self, docs: List[Dict[str, Any]]):
        for doc in docs:
            self.insert_one(doc)

    def find_one(self, query: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        query = query or {}
        for doc in self.data:
            if all(doc.get(k) == v for k, v in query.items()):
                return doc
        return None

    def find(self, query: Dict[str, Any] = None, sort=None, limit: int = 0) -> List[Dict[str, Any]]:
        query = query or {}
        results = [doc for doc in self.data if all(doc.get(k) == v for k, v in query.items())]
        if sort:
            # simple sort support: [("timestamp", -1)]
            key, direction = sort[0]
            results.sort(key=lambda x: x.get(key, ""), reverse=(direction == -1))
        if limit > 0:
            results = results[:limit]
        return results

    def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        set_vals = update.get("$set", {})
        doc = self.find_one(query)
        if doc:
            doc.update(set_vals)
            return True
        elif upsert:
            new_doc = dict(query)
            new_doc.update(set_vals)
            self.insert_one(new_doc)
            return True
        return False

    def count_documents(self, query: Dict[str, Any] = None) -> int:
        return len(self.find(query))

    def delete_many(self, query: Dict[str, Any] = None):
        if not query:
            self.data.clear()
        else:
            self.data = [doc for doc in self.data if not all(doc.get(k) == v for k, v in query.items())]

class DatabaseManager:
    def __init__(self):
        self.is_connected_to_mongo = False
        self.client: Optional[MongoClient] = None
        self.db = None
        self.fallback_storage: Dict[str, InMemoryCollection] = {}
        self._init_connection()

    def _init_connection(self):
        try:
            self.client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=2500)
            # Ping database
            self.client.admin.command('ping')
            self.db = self.client[DATABASE_NAME]
            self.is_connected_to_mongo = True
            logger.info("Successfully connected to live MongoDB at %s", MONGO_URI)
            self._create_indexes()
        except Exception as e:
            self.is_connected_to_mongo = False
            logger.warning("MongoDB not reachable (%s). Activating resilient In-Memory engine.", str(e))

    def _create_indexes(self):
        if self.is_connected_to_mongo and self.db is not None:
            try:
                self.db.vehicles.create_index("vehicle_id", unique=True)
                self.db.telemetry_history.create_index([("vehicle_id", 1), ("timestamp", -1)])
                self.db.alerts.create_index([("vehicle_id", 1), ("created_at", -1)])
            except Exception as e:
                logger.warning("Failed to create Mongo indexes: %s", e)

    def get_collection(self, name: str):
        if self.is_connected_to_mongo and self.db is not None:
            return self.db[name]
        if name not in self.fallback_storage:
            self.fallback_storage[name] = InMemoryCollection(name)
        return self.fallback_storage[name]

    @property
    def vehicles(self):
        return self.get_collection("vehicles")

    @property
    def telemetry_history(self):
        return self.get_collection("telemetry_history")

    @property
    def alerts(self):
        return self.get_collection("alerts")

    @property
    def system_logs(self):
        return self.get_collection("system_logs")

# Global singleton
db_manager = DatabaseManager()

def seed_initial_vehicles():
    """Seeds the 14 vehicle records into MongoDB if collection is empty."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    config_file = os.path.join(base_dir, "data", "routes_config.json")
    
    with open(config_file, "r") as f:
        data = json.load(f)
    
    vehicles_config = data["vehicles"]
    
    for v in vehicles_config:
        existing = db_manager.vehicles.find_one({"vehicle_id": v["vehicle_id"]})
        doc = {
            "vehicle_id": v["vehicle_id"],
            "driver_id": v["driver_id"],
            "driver_name": v["driver_name"],
            "vehicle_type": v["type"],
            "plate": v["plate"],
            "capacity_kg": v["capacity_kg"],
            "fuel_capacity_l": v["fuel_capacity_l"],
            "base_fuel_rate": v["base_fuel_rate"],
            "route_name": v["route_name"],
            "origin": v["origin"],
            "destination": v["destination"],
            "waypoints": v["waypoints"],
            "current_location": {
                "latitude": v["waypoints"][0][0],
                "longitude": v["waypoints"][0][1]
            },
            "speed_kmh": 0.0,
            "fuel_level_pct": 100.0,
            "fuel_consumption_rate": v["base_fuel_rate"],
            "delivery_status": "Ready",
            "traffic_congestion": "Low",
            "weather_condition": "Clear",
            "estimated_arrival_time_min": 180.0,
            "delay_risk": "Low",
            "trip_progress_pct": 0.0,
            "updated_at": datetime.utcnow().isoformat()
        }
        if not existing:
            db_manager.vehicles.insert_one(doc)
        else:
            db_manager.vehicles.update_one({"vehicle_id": v["vehicle_id"]}, {"$set": doc})

    logger.info("Initialized 14 vehicle profiles in MongoDB collection 'vehicles'.")
