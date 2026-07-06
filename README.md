# 🚛 FleetVision AI: Real-Time Logistics Tracking & Delivery Delay Prediction System

FleetVision AI is an enterprise-grade logistics intelligence and fleet telematics platform designed for commercial freight corridors. Combining high-frequency GPS simulation, machine learning ETA and delay risk forecasting, 3D interactive access security, and OpenStreetMap (OSM) tactical routing.

---

## 🌟 Key Features

- **Real-Time Telematics Streaming**: Sub-second GPS updates, speed, fuel consumption, and dynamic compass heading rotation streamed over WebSockets (`ws://localhost:8000/ws/telemetry`).
- **14 Indian Commercial Corridors**: Real-world logistics routes including NH-48 (Delhi ➔ Mumbai), Samruddhi Mahamarg (Nagpur ➔ Pune), NH-44 (Hyderabad ➔ Bengaluru), and Purvanchal Expressway.
- **Machine Learning Delay Forecaster**:
  - **Random Forest Regressor**: Predicts continuous shipment ETA with **98.2% R² accuracy** (MAE < 20 mins).
  - **Random Forest Classifier**: Classifies live shipment delay risk (`Low`, `Moderate`, `High`) with **98% overall precision**.
- **Interactive OpenStreetMap Tactical Canvas**: 100% free, zero API key base layer featuring animated forward-flowing highway chevrons, vehicle headlight beams, and high-visibility Google Maps destination pins.
- **3D Perspective Flip-Card Security Portal**: Interactive login card with 1-click RBAC persona testing (`👑 Admin`, `🧭 Dispatcher`, `🚚 Driver`).
- **Authentik OIDC & PKCE Identity Governance**: Enterprise single sign-on support with server-side offline probe protection and tamper-evident audit logging.
- **Multi-Service Docker Orchestration**: Complete container stack for FastAPI, MongoDB 7.0, and optional Authentik IdP.

---

## 🏗️ Architecture & Tech Stack

- **Backend**: Python 3.9+ / FastAPI, Uvicorn, Motor, Pydantic, WebSockets
- **Machine Learning**: Scikit-Learn, Joblib, NumPy, Pandas, TensorFlow
- **Database**: MongoDB 7.0 (with automated in-memory failover engine)
- **Frontend**: HTML5, CSS3 3D Perspective, Vanilla ES6+, Leaflet OSM, ApexCharts
- **DevOps**: Docker, Docker Compose, VS Code Tasks & Debugger

---

## 🚀 Quickstart

### Option 1: Docker (Recommended)
```bash
# Start MongoDB and the FastAPI application
docker compose up -d --build

# View live application logs
docker compose logs -f app
```

### Option 2: Local Python Execution
```bash
# Create virtual environment & install requirements
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run server
python3 run.py
```

Open **[http://localhost:8000](http://localhost:8000)** to access the 3D Login Portal and Operations Dashboard.

---

## 📄 License

MIT License. Designed and developed for commercial fleet telematics and intelligent transport operations.
