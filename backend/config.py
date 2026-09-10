"""
FleetVisionAI: Configuration Settings
"""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# MongoDB Settings
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "fleetvision_ai")

# App Settings
APP_TITLE = "FleetVisionAI: Real-Time Logistics Tracking & Delivery Delay Prediction System"
DEBUG = True

# Simulation Configuration
SIMULATION_TOTAL_VEHICLES = 14
DEFAULT_TICK_SECONDS = 1.0
FIVE_MINUTE_TICKS = 300  # 300 steps = 5 mins at 1s/step
DEFAULT_SPEED_MULTIPLIER = 1.0

# Server & Security Configuration
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")
SESSION_SECRET = os.getenv("SESSION_SECRET", "fleetvision-secret-key-2026")

# Authentik OIDC OAuth2 Configuration
AUTHENTIK_HOST = os.getenv("AUTHENTIK_HOST", "http://localhost:9000").rstrip("/")
AUTHENTIK_APP_SLUG = os.getenv("AUTHENTIK_APP_SLUG", "fleetvision-ai")
AUTHENTIK_CLIENT_ID = os.getenv("AUTHENTIK_CLIENT_ID", "fleetvision-client-id")
AUTHENTIK_CLIENT_SECRET = os.getenv("AUTHENTIK_CLIENT_SECRET", "fleetvision-client-secret")
AUTHENTIK_REDIRECT_URI = os.getenv("AUTHENTIK_REDIRECT_URI", f"http://localhost:{PORT}/api/auth/callback")

# Rate Limiting & Audit Trail
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 15 * 60  # 15 minutes lockout
MAX_AUDIT_LOGS = 100

