# 🐳 FleetVision AI — VS Code & Docker Execution Guide

This document provides a complete, step-by-step operational manual for building, running, debugging, testing, and managing **FleetVision AI** using **Docker** and **Docker Compose** inside **Visual Studio Code**.

---

## 📌 Table of Contents
1. [Prerequisites & VS Code Setup](#1-prerequisites--vs-code-setup)
2. [Docker Architecture Overview](#2-docker-architecture-overview)
3. [Step-by-Step Execution Commands](#3-step-by-step-execution-commands)
   - [Mode A: Standard Core Stack (Recommended)](#mode-a-standard-core-stack-recommended)
   - [Mode B: Full Stack with Database GUI](#mode-b-full-stack-with-database-gui-mongo-express)
   - [Mode C: Enterprise Identity Provider Stack (Authentik SSO)](#mode-c-enterprise-identity-provider-stack-authentik-sso)
   - [Mode D: Hybrid Development Mode (Local Python + Containerized DBs)](#mode-d-hybrid-development-mode)
4. [Monitoring, Logs & Health Checks](#4-monitoring-logs--health-checks)
5. [Running Tests & Executing Commands in Containers](#5-running-tests--executing-commands-in-containers)
6. [Stopping, Teardown & Volume Reset](#6-stopping-teardown--volume-reset)
7. [Detailed Command & Flag Reference](#7-detailed-command--flag-reference)
8. [Port Forwarding & Service Endpoints](#8-port-forwarding--service-endpoints)
9. [Troubleshooting & FAQs](#9-troubleshooting--faqs)

---

## 1. Prerequisites & VS Code Setup

### System Requirements
- **Docker Desktop** (macOS, Windows, or Linux) installed and running.
  - Verify installation:
    ```bash
    docker --version
    docker compose version
    ```
- **Visual Studio Code** installed.

### Recommended VS Code Extensions
Open the Extensions sidebar in VS Code (`Ctrl + Shift + X` or `Cmd + Shift + X`) and install:
1. **Docker** (`ms-azuretools.vscode-docker`):
   - Adds a Docker tab in the VS Code Activity Bar.
   - Allows right-click inspection of containers, image layers, logs, and volume files.
2. **Dev Containers** (`ms-vscode-remote.remote-containers`):
   - Lets you attach VS Code directly into the running container for in-container development.

---

## 2. Docker Architecture Overview

FleetVision AI uses a multi-container microservice topology defined in `docker-compose.yml`:

```mermaid
graph TD
    Client["Host Browser / VS Code"] -->|Port 8000| App["fleetvision-app (FastAPI + Uvicorn)"]
    Client -->|Port 8081 (Optional)| MongoExp["fleetvision-mongo-express (GUI)"]
    Client -->|Port 9000 (Optional)| AuthServer["fleetvision-authentik-server (IdP)"]

    subgraph "Docker Bridge Network: fleetvision-net"
        App -->|Port 27017| Mongo["fleetvision-mongodb (Mongo 7.0)"]
        App -->|Port 9092| Kafka["fleetvision-kafka (Kafka 7.5)"]
        Kafka -->|Port 2181| ZK["fleetvision-zookeeper"]
        MongoExp -->|Inspects| Mongo
        AuthServer --> AuthPG["authentik-postgresql"]
        AuthServer --> AuthRedis["authentik-redis"]
    end

    subgraph "Persistent Storage"
        Mongo --> VolMongo[("mongo_data")]
        AuthPG --> VolAuth[("authentik_db")]
    end
```

---

## 3. Step-by-Step Execution Commands

Open your VS Code Integrated Terminal (`Ctrl + \`` or `Cmd + \``) in the project workspace root (`login page/`).

### Mode A: Standard Core Stack (Recommended)
Spins up the core FastAPI application server, MongoDB 7.0, and Kafka streaming broker in detached background mode:
```bash
docker compose up -d --build
```
- **What happens**:
  1. Docker builds the application image using `Dockerfile`.
  2. Pulls and launches `mongo:7.0`, `cp-zookeeper:7.5.0`, and `cp-kafka:7.5.0`.
  3. Waits for MongoDB health check probes to pass before starting the FastAPI app.
  4. Starts the live telematics simulation loop and ML inference engines.

---

### Mode B: Full Stack with Database GUI (Mongo-Express)
Spins up the core stack plus the **Mongo-Express Web GUI** on port `8081` to view collections, schemas, and audit logs visually:
```bash
docker compose --profile tools up -d --build
```
- **Access Mongo-Express**: [http://localhost:8081/](http://localhost:8081/)

---

### Mode C: Enterprise Identity Provider Stack (Authentik SSO)
Spins up the application along with the full **Authentik Enterprise OIDC/SAML IdP** cluster (PostgreSQL 16, Redis, Authentik Server, Authentik Worker):
```bash
docker compose --profile auth up -d --build
```
- **Access Authentik Gateway**: [http://localhost:9000/](http://localhost:9000/)

---

### Mode D: Hybrid Development Mode
If you prefer running and debugging Python code directly within VS Code (with local breakpoints and Python debugger), but want containerized MongoDB and Kafka:
1. Start only the databases in Docker:
   ```bash
   docker compose up -d mongodb kafka
   ```
2. Run the application locally in VS Code:
   ```bash
   .venv/bin/python run.py
   ```

---

## 4. Monitoring, Logs & Health Checks

### Check Container Status
Displays the running containers, their health states, and mapped host ports:
```bash
docker compose ps
```

### View Application Logs (Live Stream)
Follows realtime uvicorn request logs, WebSocket events, and background simulation telemetry:
```bash
docker compose logs -f app
```
*(Press `Ctrl + C` to exit log viewing without stopping the container)*

### View MongoDB Logs
```bash
docker compose logs -f mongodb
```

### View Kafka Logs
```bash
docker compose logs -f kafka
```

### View All Services Logs Combined
```bash
docker compose logs -f --tail=100
```

---

## 5. Running Tests & Executing Commands in Containers

You can execute commands inside the running container without opening a separate SSH connection:

### 1. Run the Automated Pytest Suite
Runs all 5 unit tests for authentication, RBAC, vehicle scoping, and Super Admin fleet access approvals inside the container:
```bash
docker compose exec app pytest tests/ -v
```

### 2. Open an Interactive Bash Shell in the Container
Opens an interactive Linux prompt located at `/app`:
```bash
docker compose exec app bash
```
From here, you can inspect environment variables, run Python one-liners, or check filesystem state. Type `exit` to return to your host terminal.

### 3. Open MongoDB Interactive Shell (`mongosh`)
Directly query MongoDB collections inside the database container:
```bash
docker compose exec mongodb mongosh fleetvision_ai
```
Useful database inspection commands:
```javascript
// Show all collections
show collections

// Count registered users
db.users.countDocuments()

// Inspect pending Fleet Access Requests
db.fleet_access_requests.find({ status: "pending" }).pretty()

// View recent tamper-evident audit records
db.audit_logs.find().sort({ timestamp: -1 }).limit(5).pretty()

// Exit mongosh
exit
```

---

## 6. Stopping, Teardown & Volume Reset

### 1. Graceful Shutdown (Preserve Database Data)
Stops and removes the containers and network while **keeping all data intact** in Docker named volumes:
```bash
docker compose down
```

### 2. Complete Teardown & Volume Reset (Clean Slate)
Stops containers and **deletes all database volumes** (`mongo_data`, `authentik_db`). Use this when you want a completely fresh database initialization:
```bash
docker compose down -v
```

### 3. Force Rebuild Without Docker Cache
Forces a clean rebuild from scratch if you change system dependencies or `requirements.txt`:
```bash
docker compose build --no-cache
docker compose up -d
```

---

## 7. Detailed Command & Flag Reference

| Command / Flag | Syntax Example | Technical Explanation & Usage |
| :--- | :--- | :--- |
| `docker compose up` | `docker compose up` | Reads `docker-compose.yml`, builds necessary images, creates virtual networks, resolves dependency ordering (`depends_on`), and starts the service topology. |
| `-d` (*detached mode*) | `docker compose up -d` | Runs all containers in background daemon mode. Releases the terminal prompt so you can continue using VS Code. |
| `--build` | `docker compose up -d --build` | Forces Docker to rebuild local images before running. Ensures recent modifications to `backend/`, `Dockerfile`, or scripts are compiled into the image. |
| `--profile <name>` | `docker compose --profile tools up -d` | Targets specific service clusters. Services with `profiles: [tools]` or `profiles: [auth]` will only start when explicitly designated by this flag. |
| `docker compose ps` | `docker compose ps` | Lists all containers associated with this project, their IDs, current uptime, health check status (`healthy`/`unhealthy`), and port bindings. |
| `docker compose logs -f` | `docker compose logs -f app` | The `-f` (*follow*) flag streams stdout and stderr from the container in real time. Equivalent to `tail -f`. |
| `docker compose exec` | `docker compose exec app pytest` | Injects and executes a new process inside an already running container namespace without restarting or stopping the container. |
| `docker compose down` | `docker compose down` | Gracefully sends `SIGTERM` (followed by `SIGKILL` after grace period) to all running services and tears down the default Docker network. |
| `-v` (*volumes flag*) | `docker compose down -v` | Wipes the persistent Docker named volumes mounted to `/data/db`. Removes all previously saved users, vehicle state, and audit logs. |

---

## 8. Port Forwarding & Service Endpoints

Once your containers are running, navigate to these endpoints in your web browser:

| Service / Interface | Local URL | Default Credentials | Description |
| :--- | :--- | :--- | :--- |
| **3D Login Portal** | [http://localhost:8000/](http://localhost:8000/) | *See credentials below* | Persona showcase, quick-login cards, SSO bridge |
| **Operations Dashboard** | [http://localhost:8000/dashboard](http://localhost:8000/dashboard) | Session-authenticated | Live Leaflet tracking, ETA ML predictions, Access Requests |
| **Interactive API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Public / None | Interactive Swagger UI for all REST endpoints |
| **Alternative API Docs** | [http://localhost:8000/redoc](http://localhost:8000/redoc) | Public / None | Clean ReDoc API technical specification |
| **Mongo-Express GUI** | [http://localhost:8081/](http://localhost:8081/) | Public (Localhost) | Visual web explorer for MongoDB collections |
| **Authentik SSO Admin** | [http://localhost:9000/](http://localhost:9000/) | `akadmin` / Setup on first run | Enterprise Identity Provider administrative console |

### Pre-Configured Demo Accounts:
- 👑 **Fleet Operations Admin**: `admin@fleetvision.ai` / `fleet2026`
- ⚙️ **Super Admin**: `superadmin@fleetvision.ai` / `fleet2026`
- 📦 **Logistics Customer**: `customer@fleetvision.ai` / `fleet2026`

---

## 9. Troubleshooting & FAQs

### Q1: Port 8000 is already in use (`bind: address already in use`)
**Cause**: A previously launched Python server or background process is holding port 8000.  
**Fix**: Free the port before launching Docker:
```bash
# On macOS / Linux:
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Now launch docker compose:
docker compose up -d --build
```

### Q2: Do I need to rebuild the container when editing HTML, CSS, or JS files?
**Answer**: **No.** In `docker-compose.yml`, the `frontend/` directory is mapped via a Docker bind mount:
```yaml
volumes:
  - ./frontend:/app/frontend
  - ./data:/app/data
```
Any edits you make in VS Code to `frontend/index.html`, `frontend/css/style.css`, or `frontend/js/dashboard.js` are reflected **instantly upon browser refresh** without needing to rerun `docker compose build`.

### Q3: How do I view container resource consumption (CPU & RAM)?
```bash
docker stats
```
Displays a live dashboard of CPU %, Memory usage, network I/O, and block I/O for all running FleetVision containers.
