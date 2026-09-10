"""
FleetVisionAI: LSTM Sequence Model Training for Temporal ETA Forecasting
Trains a recurrent LSTM neural network in TensorFlow/Keras using rolling sequence
windows of telemetry data (speed dynamics, traffic progression, distance decay).
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
import tensorflow as tf
from tensorflow.keras import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

# Suppress verbose TF logging
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE_DIR, "data", "historical_telemetry.csv")
MODEL_DIR = os.path.join(BASE_DIR, "ml", "saved_models")
LSTM_MODEL_PATH = os.path.join(MODEL_DIR, "lstm_eta.keras")
LSTM_SCALER_PATH = os.path.join(MODEL_DIR, "lstm_scaler.joblib")

SEQ_LENGTH = 5

def create_sequences(df: pd.DataFrame, feature_cols: list, seq_length: int = 5):
    """
    Creates temporal sequence windows per vehicle.
    """
    sequences = []
    targets = []
    
    for v_id, group in df.groupby("vehicle_id"):
        data_vals = group[feature_cols].values
        target_vals = group["estimated_arrival_time_min"].values
        
        for i in range(len(data_vals) - seq_length):
            seq = data_vals[i : i + seq_length]
            target = target_vals[i + seq_length]
            sequences.append(seq)
            targets.append(target)
            
    return np.array(sequences, dtype=np.float32), np.array(targets, dtype=np.float32)

def train_lstm_model():
    print("Loading telemetry data for LSTM training...")
    df = pd.read_csv(DATA_PATH)
    
    traffic_map = {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}
    weather_map = {"Clear": 0, "Rain": 1, "Fog": 2, "Snow": 3}
    df["traffic_encoded"] = df["traffic_congestion"].map(traffic_map).fillna(0)
    df["weather_encoded"] = df["weather_condition"].map(weather_map).fillna(0)
    
    feature_cols = [
        "speed_kmh",
        "distance_remaining_km",
        "fuel_consumption_rate",
        "fuel_level_pct",
        "trip_progress_pct",
        "traffic_encoded",
        "weather_encoded"
    ]
    
    # Scale features
    scaler = MinMaxScaler()
    df_scaled = df.copy()
    df_scaled[feature_cols] = scaler.fit_transform(df[feature_cols])
    
    X, y = create_sequences(df_scaled, feature_cols, seq_length=SEQ_LENGTH)
    print(f"Constructed {X.shape[0]} temporal sequence windows of shape {X.shape[1:]}")
    
    # Train / Test split
    split_idx = int(0.85 * len(X))
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]
    
    # Define LSTM Architecture
    print("\n--- Building TensorFlow/Keras LSTM Architecture ---")
    model = Sequential([
        LSTM(64, input_shape=(SEQ_LENGTH, len(feature_cols)), return_sequences=True),
        Dropout(0.15),
        LSTM(32, return_sequences=False),
        Dropout(0.15),
        Dense(32, activation="relu"),
        Dense(1)
    ])
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.003),
        loss="huber",
        metrics=["mae"]
    )
    
    model.summary()
    
    early_stop = EarlyStopping(
        monitor="val_mae",
        patience=5,
        restore_best_weights=True
    )
    
    print("\nTraining LSTM Model...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=18,
        batch_size=32,
        callbacks=[early_stop],
        verbose=1
    )
    
    val_loss, val_mae = model.evaluate(X_val, y_val, verbose=0)
    print(f"\nLSTM Training Complete! Validation MAE: {val_mae:.2f} minutes")
    
    # Save Model & Scaler
    model.save(LSTM_MODEL_PATH)
    joblib.dump({
        "scaler": scaler,
        "feature_cols": feature_cols,
        "seq_length": SEQ_LENGTH,
        "traffic_map": traffic_map,
        "weather_map": weather_map,
        "val_mae": round(float(val_mae), 2)
    }, LSTM_SCALER_PATH)
    
    print(f"Saved LSTM model to {LSTM_MODEL_PATH}")
    print(f"Saved LSTM metadata to {LSTM_SCALER_PATH}")

if __name__ == "__main__":
    train_lstm_model()
