"""
FleetVisionAI: Synthetic Data Generator
Generates realistic multi-vehicle GPS telemetry, historical transit records,
and route waypoints for 14 vehicles across major logistics corridors.
"""

import json
import os
import random
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import math
import numpy as np
import pandas as pd

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

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, "data", "routes_config.json")
OUTPUT_CSV_PATH = os.path.join(BASE_DIR, "data", "historical_telemetry.csv")

WEATHER_CONDITIONS = ["Clear", "Rain", "Fog", "Heatwave"]
WEATHER_WEIGHTS = [0.65, 0.20, 0.10, 0.05]
WEATHER_FACTORS = {"Clear": 1.0, "Rain": 1.25, "Fog": 1.35, "Heatwave": 1.40}

TRAFFIC_LEVELS = ["Low", "Moderate", "High", "Severe"]
TRAFFIC_WEIGHTS = [0.45, 0.30, 0.18, 0.07]
TRAFFIC_FACTORS = {"Low": 1.0, "Moderate": 1.2, "High": 1.5, "Severe": 2.0}

def load_vehicle_configs() -> List[Dict]:
    with open(CONFIG_PATH, "r") as f:
        data = json.load(f)
    return data["vehicles"]

def interpolate_points(p1: List[float], p2: List[float], fraction: float) -> Tuple[float, float]:
    """Linearly interpolate between two GPS points."""
    lat = p1[0] + (p2[0] - p1[0]) * fraction
    lon = p1[1] + (p2[1] - p1[1]) * fraction
    return lat, lon

def calculate_total_route_distance(waypoints: List[List[float]]) -> float:
    total_km = 0.0
    for i in range(len(waypoints) - 1):
        total_km += distance_km(waypoints[i], waypoints[i+1])
    return total_km

def get_location_along_route(waypoints: List[List[float]], progress_ratio: float) -> Tuple[float, float, float]:
    """
    Returns (lat, lon, distance_remaining_km) along the waypoints path
    given progress ratio [0.0, 1.0].
    """
    total_km = calculate_total_route_distance(waypoints)
    target_dist = total_km * progress_ratio
    
    accumulated_dist = 0.0
    for i in range(len(waypoints) - 1):
        segment_dist = distance_km(waypoints[i], waypoints[i+1])
        if accumulated_dist + segment_dist >= target_dist or i == len(waypoints) - 2:
            remaining_in_seg = target_dist - accumulated_dist
            seg_ratio = max(0.0, min(1.0, remaining_in_seg / max(0.001, segment_dist)))
            lat, lon = interpolate_points(waypoints[i], waypoints[i+1], seg_ratio)
            dist_remaining = max(0.0, total_km - target_dist)
            return lat, lon, dist_remaining
        accumulated_dist += segment_dist
        
    last = waypoints[-1]
    return last[0], last[1], 0.0

def generate_synthetic_historical_dataset(num_samples: int = 5600) -> pd.DataFrame:
    """
    Generates historical trips and telemetry points to train Random Forest and LSTM models.
    """
    vehicles = load_vehicle_configs()
    records = []
    
    print(f"Generating {num_samples} synthetic telemetry records for {len(vehicles)} vehicles...")
    
    samples_per_vehicle = num_samples // len(vehicles)
    start_time = datetime.now() - timedelta(days=14)
    
    for v_idx, v in enumerate(vehicles):
        waypoints = v["waypoints"]
        total_dist_km = calculate_total_route_distance(waypoints)
        base_speed = 85.0  # km/h highway average
        base_fuel = v["base_fuel_rate"]
        
        # Simulate multiple completed trips per vehicle
        trips_count = 20
        samples_per_trip = samples_per_vehicle // trips_count
        
        for trip_num in range(trips_count):
            trip_start = start_time + timedelta(hours=(v_idx * 12 + trip_num * 14))
            weather = random.choices(WEATHER_CONDITIONS, weights=WEATHER_WEIGHTS)[0]
            weather_mult = WEATHER_FACTORS[weather]
            
            for step in range(samples_per_trip):
                progress = step / max(1, samples_per_trip - 1)
                lat, lon, dist_remaining = get_location_along_route(waypoints, progress)
                
                # Dynamic traffic condition along route
                traffic = random.choices(TRAFFIC_LEVELS, weights=TRAFFIC_WEIGHTS)[0]
                traffic_mult = TRAFFIC_FACTORS[traffic]
                
                # Speed affected by traffic and weather
                target_speed = base_speed / (traffic_mult * (weather_mult ** 0.5))
                speed = max(15.0, min(115.0, np.random.normal(target_speed, 6.0)))
                
                # Fuel consumption increases in heavy traffic / stop-and-go
                fuel_rate = base_fuel * (1.0 + (traffic_mult - 1.0) * 0.45 + (weather_mult - 1.0) * 0.25)
                fuel_rate = round(max(12.0, np.random.normal(fuel_rate, 1.8)), 2)
                
                # Remaining fuel percentage
                fuel_pct = max(8.0, 100.0 - (progress * 75.0) + np.random.normal(0, 2.0))
                
                # Target ETA in minutes based on real distance, current speed & conditions
                nominal_eta_min = (dist_remaining / max(20.0, speed)) * 60.0
                delay_factor = (traffic_mult * weather_mult)
                actual_eta_min = nominal_eta_min * delay_factor + np.random.normal(0, 3.5)
                actual_eta_min = max(0.5, round(actual_eta_min, 1))
                
                # Delay Risk categorization
                delay_delta_min = actual_eta_min - nominal_eta_min
                if delay_delta_min > 25.0 or (traffic == "Severe" and dist_remaining > 40):
                    risk_level = "High"
                    status = "Delayed" if speed < 40 else "High Risk"
                elif delay_delta_min > 10.0 or traffic == "High":
                    risk_level = "Moderate"
                    status = "In Transit"
                else:
                    risk_level = "Low"
                    status = "In Transit" if progress < 0.96 else "Arrived"
                    
                timestamp = trip_start + timedelta(minutes=step * 4)
                
                records.append({
                    "vehicle_id": v["vehicle_id"],
                    "driver_id": v["driver_id"],
                    "driver_name": v["driver_name"],
                    "vehicle_type": v["type"],
                    "timestamp": timestamp.isoformat(),
                    "gps_latitude": round(lat, 5),
                    "gps_longitude": round(lon, 5),
                    "speed_kmh": round(speed, 1),
                    "fuel_consumption_rate": fuel_rate,
                    "fuel_level_pct": round(fuel_pct, 1),
                    "distance_remaining_km": round(dist_remaining, 2),
                    "traffic_congestion": traffic,
                    "weather_condition": weather,
                    "trip_progress_pct": round(progress * 100.0, 1),
                    "delivery_status": status,
                    "delay_risk": risk_level,
                    "estimated_arrival_time_min": actual_eta_min
                })
                
    df = pd.DataFrame(records)
    df.to_csv(OUTPUT_CSV_PATH, index=False)
    print(f"Generated {len(df)} records successfully saved to {OUTPUT_CSV_PATH}")
    return df

if __name__ == "__main__":
    df = generate_synthetic_historical_dataset()
    print("Dataset Summary:")
    print(df[["speed_kmh", "distance_remaining_km", "fuel_consumption_rate", "estimated_arrival_time_min"]].describe())
    print("\nRisk Level Distribution:")
    print(df["delay_risk"].value_counts())
