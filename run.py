#!/usr/bin/env python3
"""
FleetVision AI — Quickstart Server Launcher
Launches the unified FastAPI backend, WebSocket live telemetry streamer,
and serves the 3D Login Portal, Operations Dashboard, and Showcase pages.
"""

import sys
import os
import uvicorn

# Ensure project root is in python path
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.config import HOST, PORT, APP_TITLE, AUTHENTIK_HOST

def main():
    print("=" * 70)
    print(f"🚀  {APP_TITLE}")
    print("=" * 70)
    print(f"📍  Launch Portal (3D Login):  http://localhost:{PORT}/")
    print(f"🚛  Operations Dashboard:      http://localhost:{PORT}/dashboard")
    print(f"🌐  Public Showcase:           http://localhost:{PORT}/showcase")
    print(f"📡  Live Telemetry WebSockets: ws://localhost:{PORT}/ws/telemetry")
    print(f"🛡️   Authentik OIDC Gateway:    {AUTHENTIK_HOST}")
    print("-" * 70)
    print("🔑  Pre-Configured RBAC Demo Accounts:")
    print("    • 👑 Administrator:   admin@fleetvision.ai   / fleet2026")
    print("    • 🧭 Dispatch Manager: manager@fleetvision.ai / fleet2026")
    print("    • 🚚 Driver/Operator:  user@fleetvision.ai    / fleet2026")
    print("=" * 70)

    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)

if __name__ == "__main__":
    main()
