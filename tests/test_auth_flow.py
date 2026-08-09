import json
import urllib.parse
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.main import app


client = TestClient(app)


def test_outsider_signup_requires_super_admin_approval():
    email = f"new_operator_{__import__('uuid').uuid4().hex[:8]}@fleetvision.ai"
    signup = client.post(
        "/api/auth/signup",
        json={
            "name": "New Operator",
            "email": email,
            "password": "StrongPass123!",
            "role": "admin",
        },
    )

    assert signup.status_code == 200, signup.text
    payload = signup.json()
    assert payload["status"] == "pending_approval", payload

    denied_login = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass123!"},
    )

    assert denied_login.status_code == 403, denied_login.text
    assert "approval" in denied_login.json()["detail"].lower(), denied_login.json()

    admin_login = client.post(
        "/api/auth/login",
        json={"email": "admin@fleetvision.ai", "password": "fleet2026"},
    )

    assert admin_login.status_code == 200, admin_login.text
    admin_cookie = admin_login.cookies.get("fleetvision_auth_user")
    assert admin_cookie is not None

    denied_approval = client.post(
        "/api/auth/approve-user",
        json={"email": email},
        cookies={"fleetvision_auth_user": admin_cookie},
    )
    assert denied_approval.status_code == 403

    super_admin_login = client.post(
        "/api/auth/login",
        json={"email": "superadmin@fleetvision.ai", "password": "fleet2026"},
    )
    assert super_admin_login.status_code == 200, super_admin_login.text
    super_admin_cookie = super_admin_login.cookies.get("fleetvision_auth_user")
    assert super_admin_cookie is not None

    denied_super_admin_grant = client.post(
        "/api/auth/approve-user",
        json={"email": email, "role": "super_admin"},
        cookies={"fleetvision_auth_user": super_admin_cookie},
    )
    assert denied_super_admin_grant.status_code == 400

    approve = client.post(
        "/api/auth/approve-user",
        json={"email": email, "role": "customer"},
        cookies={"fleetvision_auth_user": super_admin_cookie},
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["approved"] is True

    admin_email = f"new_admin_{__import__('uuid').uuid4().hex[:8]}@fleetvision.ai"
    client.post(
        "/api/auth/signup",
        json={"name": "New Admin", "email": admin_email, "password": "StrongPass123!", "role": "customer"},
    )
    admin_approval = client.post(
        "/api/auth/approve-user",
        json={"email": admin_email, "role": "admin"},
        cookies={"fleetvision_auth_user": super_admin_cookie},
    )
    assert admin_approval.status_code == 200
    admin_user = client.post(
        "/api/auth/login",
        json={"email": admin_email, "password": "StrongPass123!"},
    ).json()["user"]
    assert admin_user["role"] == "admin"
    assert "customer:manage" in admin_user["permissions"]
    assert "approval:manage" not in admin_user["permissions"]

    approved_login = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass123!"},
    )

    assert approved_login.status_code == 200, approved_login.text
    assert approved_login.json()["user"]["role"] == "customer"

    customer_cookie = approved_login.cookies.get("fleetvision_auth_user")
    assert customer_cookie is not None
    denied_simulation_control = client.post(
        "/api/simulation/pause",
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert denied_simulation_control.status_code == 403
    denied_booking = client.post(
        "/api/bookings",
        json={"consignor": "Test Customer"},
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert denied_booking.status_code == 403
    denied_incident = client.post(
        "/api/simulator/inject-event",
        json={"vehicle_id": "TRK-101"},
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert denied_incident.status_code == 403

    forged_session = json.loads(urllib.parse.unquote(customer_cookie.strip('"')))
    forged_session["role"] = "super_admin"
    forged_cookie = urllib.parse.quote(json.dumps(forged_session))
    forged_control = client.post(
        "/api/simulation/pause",
        cookies={"fleetvision_auth_user": forged_cookie},
    )
    assert forged_control.status_code == 403



def test_simulation_controls_require_an_authorized_role():
    denied = client.post("/api/simulation/pause")
    assert denied.status_code == 403

    super_admin_login = client.post(
        "/api/auth/login",
        json={"email": "superadmin@fleetvision.ai", "password": "fleet2026"},
    )
    assert super_admin_login.status_code == 200
    allowed = client.post(
        "/api/simulation/pause",
        cookies={"fleetvision_auth_user": super_admin_login.cookies.get("fleetvision_auth_user")},
    )
    assert allowed.status_code == 200


def test_admin_assigns_fleet_and_customer_only_sees_assigned_vehicles():
    customer_email = f"fleet_customer_{__import__('uuid').uuid4().hex[:8]}@fleetvision.ai"
    signup = client.post(
        "/api/auth/signup",
        json={"name": "Fleet Customer", "email": customer_email, "password": "StrongPass123!"},
    )
    assert signup.status_code == 200

    super_admin_login = client.post(
        "/api/auth/login",
        json={"email": "superadmin@fleetvision.ai", "password": "fleet2026"},
    )
    super_admin_cookie = super_admin_login.cookies.get("fleetvision_auth_user")
    approved = client.post(
        "/api/auth/approve-user",
        json={"email": customer_email, "role": "customer"},
        cookies={"fleetvision_auth_user": super_admin_cookie},
    )
    assert approved.status_code == 200

    admin_login = client.post(
        "/api/auth/login",
        json={"email": "admin@fleetvision.ai", "password": "fleet2026"},
    )
    admin_cookie = admin_login.cookies.get("fleetvision_auth_user")
    assignment = client.post(
        "/api/vehicles/customer-fleets",
        json={
            "customer_email": customer_email,
            "fleet_name": "Northbound Customer Fleet",
            "vehicle_ids": ["TRK-101"],
            "permissions": ["fleet:read", "help:read"],
        },
        cookies={"fleetvision_auth_user": admin_cookie},
    )
    assert assignment.status_code == 200, assignment.text

    customer_login = client.post(
        "/api/auth/login",
        json={"email": customer_email, "password": "StrongPass123!"},
    )
    customer_cookie = customer_login.cookies.get("fleetvision_auth_user")
    session = client.get("/api/auth/me", cookies={"fleetvision_auth_user": customer_cookie})
    assert session.status_code == 200
    assert session.json()["user"]["fleet_ids"] == ["TRK-101"]
    assert "view-fleets" in session.json()["user"]["dashboard_views"]
    assert "eta:read" not in session.json()["user"]["permissions"]

    vehicles = client.get("/api/vehicles", cookies={"fleetvision_auth_user": customer_cookie})
    assert [vehicle["vehicle_id"] for vehicle in vehicles.json()] == ["TRK-101"]
    overview = client.get("/api/analytics/overview", cookies={"fleetvision_auth_user": customer_cookie})
    assert overview.json()["total_vehicles"] == 1
    assert overview.json()["avg_eta_min"] is None
    charts = client.get("/api/analytics/charts", cookies={"fleetvision_auth_user": customer_cookie})
    assert charts.json()["labels"] == ["TRK-101"]
    assert charts.json()["eta_comparison"]["blended"] == []
    prediction = client.post(
        "/api/predict/eta",
        json={"origin": [1, 1], "destination": [2, 2]},
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert prediction.status_code == 403
    unassigned_vehicle = client.get(
        "/api/vehicles/TRK-102",
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert unassigned_vehicle.status_code == 403

    customer_create = client.post(
        "/api/vehicles/customer-fleets",
        json={
            "customer_email": customer_email,
            "fleet_name": "Not Allowed",
            "vehicle_ids": ["TRK-102"],
            "permissions": ["fleet:read"],
        },
        cookies={"fleetvision_auth_user": customer_cookie},
    )
    assert customer_create.status_code == 403


def test_road_route_returns_cached_road_geometry_and_checks_customer_access():
    admin_login = client.post(
        "/api/auth/login",
        json={"email": "admin@fleetvision.ai", "password": "fleet2026"},
    )
    admin_cookie = admin_login.cookies.get("fleetvision_auth_user")
    route_payload = {
        "code": "Ok",
        "routes": [{
            "distance": 15600,
            "duration": 1080,
            "geometry": {"coordinates": [[73.8, 18.5], [73.9, 18.4], [74.0, 18.3]]},
        }],
    }
    mocked_response = MagicMock()
    mocked_response.__enter__.return_value.read.return_value = json.dumps(route_payload).encode("utf-8")
    coordinates = [[18.5, 73.8], [18.3, 74.0]]

    with patch("backend.routes.vehicles.urllib.request.urlopen", return_value=mocked_response) as route_request:
        response = client.post(
            "/api/vehicles/TRK-101/road-route",
            json={"coordinates": coordinates},
            cookies={"fleetvision_auth_user": admin_cookie},
        )
        assert response.status_code == 200, response.text
        assert response.json()["coordinates"] == [[18.5, 73.8], [18.4, 73.9], [18.3, 74.0]]
        assert response.json()["distance_km"] == 15.6

        cached_response = client.post(
            "/api/vehicles/TRK-101/road-route",
            json={"coordinates": coordinates},
            cookies={"fleetvision_auth_user": admin_cookie},
        )
        assert cached_response.status_code == 200
        assert route_request.call_count == 1

    customer_login = client.post(
        "/api/auth/login",
        json={"email": "customer@fleetvision.ai", "password": "fleet2026"},
    )
    denied = client.post(
        "/api/vehicles/TRK-101/road-route",
        json={"coordinates": coordinates},
        cookies={"fleetvision_auth_user": customer_login.cookies.get("fleetvision_auth_user")},
    )
    assert denied.status_code == 403

# Simulation controls RBAC tested

# Customer vehicle scoping & isolation test verified
