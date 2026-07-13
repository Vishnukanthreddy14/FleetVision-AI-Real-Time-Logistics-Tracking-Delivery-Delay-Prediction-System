"""
FleetVisionAI: Random Forest Model Training
Trains:
1. RandomForestRegressor for continuous Estimated Time of Arrival (ETA in minutes)
2. RandomForestClassifier for Delay Risk Classification (Low, Moderate, High)
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.metrics import mean_absolute_error, r2_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "historical_telemetry.csv")
MODEL_DIR = os.path.join(BASE_DIR, "ml", "saved_models")
MODEL_OUT_PATH = os.path.join(MODEL_DIR, "rf_models.joblib")

os.makedirs(MODEL_DIR, exist_ok=True)

def train_random_forest():
    print("Loading historical dataset from:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    
    # Feature mappings
    traffic_map = {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}
    weather_map = {"Clear": 0, "Rain": 1, "Fog": 2, "Heatwave": 3, "Snow": 3}
    
    df["traffic_encoded"] = df["traffic_congestion"].map(traffic_map).fillna(0)
    df["weather_encoded"] = df["weather_condition"].map(weather_map).fillna(0)
    
    # Feature set for ML
    feature_cols = [
        "speed_kmh",
        "distance_remaining_km",
        "fuel_consumption_rate",
        "fuel_level_pct",
        "trip_progress_pct",
        "traffic_encoded",
        "weather_encoded"
    ]
    
    X = df[feature_cols].copy()
    y_eta = df["estimated_arrival_time_min"].values
    
    risk_encoder = LabelEncoder()
    y_risk = risk_encoder.fit_transform(df["delay_risk"].values)
    
    # Train-test split
    X_train, X_test, y_eta_train, y_eta_test, y_risk_train, y_risk_test = train_test_split(
        X, y_eta, y_risk, test_size=0.2, random_state=42
    )
    
    # 1. Random Forest Regressor for ETA
    print("\n--- Training Random Forest Regressor (ETA) ---")
    rf_regressor = RandomForestRegressor(
        n_estimators=120,
        max_depth=16,
        min_samples_split=4,
        random_state=42,
        n_jobs=-1
    )
    rf_regressor.fit(X_train, y_eta_train)
    y_eta_pred = rf_regressor.predict(X_test)
    mae = mean_absolute_error(y_eta_test, y_eta_pred)
    r2 = r2_score(y_eta_test, y_eta_pred)
    print(f"Random Forest Regressor -> MAE: {mae:.2f} mins, R2 Score: {r2:.4f}")
    
    # 2. Random Forest Classifier for Delay Risk
    print("\n--- Training Random Forest Classifier (Delay Risk) ---")
    rf_classifier = RandomForestClassifier(
        n_estimators=100,
        max_depth=14,
        min_samples_split=4,
        random_state=42,
        n_jobs=-1
    )
    rf_classifier.fit(X_train, y_risk_train)
    y_risk_pred = rf_classifier.predict(X_test)
    
    print("Classification Report for Delay Risk:")
    print(classification_report(y_risk_test, y_risk_pred, target_names=risk_encoder.classes_))
    
    # Save artifacts
    artifacts = {
        "regressor": rf_regressor,
        "classifier": rf_classifier,
        "risk_encoder": risk_encoder,
        "feature_cols": feature_cols,
        "traffic_map": traffic_map,
        "weather_map": weather_map,
        "metrics": {
            "regressor_mae": round(mae, 2),
            "regressor_r2": round(r2, 4)
        }
    }
    
    joblib.dump(artifacts, MODEL_OUT_PATH)
    print(f"\nSaved Random Forest models and encoders to {MODEL_OUT_PATH}")
    return artifacts

if __name__ == "__main__":
    train_random_forest()
