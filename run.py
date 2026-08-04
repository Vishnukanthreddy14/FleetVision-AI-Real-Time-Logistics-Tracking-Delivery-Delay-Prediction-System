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
    print(f"�  API Base URL:              http://localhost:{PORT}/")
    print(f"📡  Live Telemetry WebSockets: ws://localhost:{PORT}/ws/telemetry")
    print(f"🛡️   Authentik OIDC Gateway:    {AUTHENTIK_HOST}")
    print("-" * 70)
    print("🔑  Pre-Configured RBAC Demo Accounts:")
    print("    • 👑 Admin:            admin@fleetvision.ai       / fleet2026")
    print("    • ⚙️  Super Admin:     superadmin@fleetvision.ai / fleet2026")
    print("    • 📦 Customer:         customer@fleetvision.ai   / fleet2026")
    print("=" * 70)

    uvicorn.run("backend.main:app", host=HOST, port=PORT, reload=True)

if __name__ == "__main__":
    main()
