"""
FleetVisionAI: XGBoost Model Training for Gradient-Boosted ETA & Delay Prediction
Trains:
1. XGBRegressor (or GradientBoostingRegressor) for continuous Estimated Time of Arrival (ETA in minutes)
2. XGBClassifier (or GradientBoostingClassifier) for Delay Risk Classification (Low, Moderate, High)
3. Computes Feature Importance Metrics for Operational Delay Root-Cause Analysis
"""

import os
import logging
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, r2_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger("fleetvision.ml.xgb")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "historical_telemetry.csv")
MODEL_DIR = os.path.join(BASE_DIR, "ml", "saved_models")
MODEL_OUT_PATH = os.path.join(MODEL_DIR, "xgb_models.joblib")

os.makedirs(MODEL_DIR, exist_ok=True)

# Attempt XGBoost with fallback to Scikit-Learn GradientBoosting
try:
    from xgboost import XGBRegressor, XGBClassifier
    USE_NATIVE_XGB = True
except Exception as e:
    USE_NATIVE_XGB = False
    from sklearn.ensemble import GradientBoostingRegressor as XGBRegressor
    from sklearn.ensemble import GradientBoostingClassifier as XGBClassifier
    print(f"XGBoost C++ library notice ({e}). Utilizing native scikit-learn Gradient Boosting ensemble engine.")

def train_xgboost():
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
    
    # 1. Gradient Boosted Regressor for ETA
    print("\n--- Training XGBoost/Gradient Boosted Regressor (ETA) ---")
    if USE_NATIVE_XGB:
        xgb_regressor = XGBRegressor(
            n_estimators=150,
            learning_rate=0.08,
            max_depth=6,
            subsample=0.85,
            colsample_bytree=0.85,
            random_state=42,
            n_jobs=-1
        )
    else:
        xgb_regressor = XGBRegressor(
            n_estimators=120,
            learning_rate=0.08,
            max_depth=6,
            subsample=0.85,
            random_state=42
        )

    xgb_regressor.fit(X_train, y_eta_train)
    y_eta_pred = xgb_regressor.predict(X_test)
    mae = mean_absolute_error(y_eta_test, y_eta_pred)
    r2 = r2_score(y_eta_test, y_eta_pred)
    print(f"XGBoost Regressor -> MAE: {mae:.2f} mins, R2 Score: {r2:.4f}")
    
    # 2. Gradient Boosted Classifier for Delay Risk
    print("\n--- Training XGBoost/Gradient Boosted Classifier (Delay Risk) ---")
    if USE_NATIVE_XGB:
        xgb_classifier = XGBClassifier(
            n_estimators=120,
            learning_rate=0.08,
            max_depth=5,
            subsample=0.85,
            random_state=42,
            n_jobs=-1
        )
    else:
        xgb_classifier = XGBClassifier(
            n_estimators=100,
            learning_rate=0.08,
            max_depth=5,
            subsample=0.85,
            random_state=42
        )

    xgb_classifier.fit(X_train, y_risk_train)
    y_risk_pred = xgb_classifier.predict(X_test)
    
    print("Classification Report for Delay Risk (XGBoost):")
    print(classification_report(y_risk_test, y_risk_pred, target_names=risk_encoder.classes_))
    
    # 3. Calculate Feature Importances
    importances = xgb_regressor.feature_importances_
    feature_importance_dict = {
        col: round(float(imp), 4) for col, imp in zip(feature_cols, importances)
    }
    print("XGBoost Feature Importances:", feature_importance_dict)
    
    # Save artifacts
    artifacts = {
        "regressor": xgb_regressor,
        "classifier": xgb_classifier,
        "risk_encoder": risk_encoder,
        "feature_cols": feature_cols,
        "feature_importances": feature_importance_dict,
        "traffic_map": traffic_map,
        "weather_map": weather_map,
        "engine_type": "xgboost" if USE_NATIVE_XGB else "gradient_boosting",
        "metrics": {
            "regressor_mae": round(mae, 2),
            "regressor_r2": round(r2, 4)
        }
    }
    
    joblib.dump(artifacts, MODEL_OUT_PATH)
    print(f"\nSaved XGBoost models and encoders to {MODEL_OUT_PATH}")
    return artifacts

if __name__ == "__main__":
    train_xgboost()
