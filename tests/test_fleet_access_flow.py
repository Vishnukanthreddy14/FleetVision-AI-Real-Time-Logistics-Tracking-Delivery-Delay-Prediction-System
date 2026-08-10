"""
FleetVision AI: Integration tests for Admin -> Super Admin Fleet Access Delegation
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.db.mongo import db_manager

client = TestClient(app)

def test_admin_tells_superadmin_and_approval_flow():
    admin_client = TestClient(app)
    sa_client = TestClient(app)
    cust_client = TestClient(app)

    # 1. Login as Admin
    admin_res = admin_client.post("/api/auth/login", json={"email": "admin@fleetvision.ai", "password": "fleet2026"})
    assert admin_res.status_code == 200

    # 2. Login as Super Admin
    sa_res = sa_client.post("/api/auth/login", json={"email": "superadmin@fleetvision.ai", "password": "fleet2026"})
    assert sa_res.status_code == 200

    # 3. Login as Customer (initially has no fleet or limited)
    cust_res = cust_client.post("/api/auth/login", json={"email": "customer@fleetvision.ai", "password": "fleet2026"})
    assert cust_res.status_code == 200

    # 4. Admin submits a Fleet Access Request to Super Admin on behalf of Customer
    submit_res = admin_client.post(
        "/api/vehicles/access-requests",
        json={
            "customer_email": "customer@fleetvision.ai",
            "fleet_name": "NH-48 Golden Corridor",
            "vehicle_ids": ["TRK-101", "TRK-102"],
            "permissions": ["fleet:read", "eta:read", "routes:read"],
            "admin_notes": "Customer contracted 40T articulated freight transit on Western Freight Corridor.",
            "priority": "High"
        }
    )
    assert submit_res.status_code == 200, submit_res.text
    req_data = submit_res.json()["request"]
    req_id = req_data["request_id"]
    assert req_data["status"] == "pending_superadmin_approval"
    assert req_data["admin_email"] == "admin@fleetvision.ai"
    assert req_data["vehicle_ids"] == ["TRK-101", "TRK-102"]

    # 5. Customer or Admin tries to approve -> must fail (403)
    cust_approve = cust_client.post(f"/api/vehicles/access-requests/{req_id}/approve")
    assert cust_approve.status_code == 403

    admin_approve = admin_client.post(f"/api/vehicles/access-requests/{req_id}/approve")
    assert admin_approve.status_code == 403

    # 6. Super Admin lists requests and sees the pending request
    list_res = sa_client.get("/api/vehicles/access-requests")
    assert list_res.status_code == 200
    items = list_res.json()
    found = [r for r in items if r["request_id"] == req_id]
    assert len(found) == 1
    assert found[0]["status"] == "pending_superadmin_approval"

    # 7. Super Admin approves the request
    approve_res = sa_client.post(f"/api/vehicles/access-requests/{req_id}/approve")
    assert approve_res.status_code == 200, approve_res.text
    approve_data = approve_res.json()
    assert approve_data["request"]["status"] == "approved"
    assert approve_data["fleet"]["customer_email"] == "customer@fleetvision.ai"
    assert "TRK-101" in approve_data["fleet"]["vehicle_ids"]

    # 8. Customer refreshes profile / vehicles -> vehicles are now accessible!
    cust_profile = cust_client.get("/api/auth/me")
    assert cust_profile.status_code == 200
    user_info = cust_profile.json()["user"]
    assert "TRK-101" in user_info.get("fleet_ids", [])
    assert "TRK-102" in user_info.get("fleet_ids", [])

    # Check vehicle list for customer
    cust_vehicles = cust_client.get("/api/vehicles")
    assert cust_vehicles.status_code == 200
    vehicle_ids = [v["vehicle_id"] for v in cust_vehicles.json()]
    assert "TRK-101" in vehicle_ids
    assert "TRK-102" in vehicle_ids

    # 9. Super Admin Rejection Flow
    # Admin submits another request
    submit_res2 = admin_client.post(
        "/api/vehicles/access-requests",
        json={
            "customer_email": "customer@fleetvision.ai",
            "fleet_name": "Samruddhi Corridor",
            "vehicle_ids": ["TRK-104"],
            "permissions": ["fleet:read"],
            "admin_notes": "Trial access request",
            "priority": "Standard"
        }
    )
    assert submit_res2.status_code == 200
    req_id2 = submit_res2.json()["request"]["request_id"]

    # Super Admin rejects with reason
    reject_res = sa_client.post(
        f"/api/vehicles/access-requests/{req_id2}/reject",
        json={"reason": "Customer SLA tier does not cover Samruddhi Corridor."}
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["request"]["status"] == "rejected"
    assert reject_res.json()["request"]["rejection_reason"] == "Customer SLA tier does not cover Samruddhi Corridor."


# 403 Forbidden check verified
