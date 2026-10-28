import pytest
import io
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.geo_service import haversine_distance_meters, analyze_geographic_context
from backend.services.risk_engine import calculate_waterlogging_risk

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_model_info_returns_real_split_metrics():
    response = client.get("/api/model/info")
    assert response.status_code == 200
    data = response.json()
    assert "classes" in data
    assert "splits" in data
    assert "test_evaluation" in data
    assert "Plastic" in data["classes"]
    assert data["splits"]["total_samples"] == 4752
    assert "precision" in data["test_evaluation"]["per_class"]["Plastic"]

def test_citizen_registration_and_login():
    email = "citizen_test@pune.in"
    reg_res = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePassword123!",
        "full_name": "Aarav Sharma",
        "ward": "Ward 9 - Kothrud"
    })
    # Either 201 or 400 if already created in earlier test run
    if reg_res.status_code == 201:
        assert "access_token" in reg_res.json()
        assert reg_res.json()["user"]["role"] == "citizen"

    # Login
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": "SecurePassword123!"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()
    token = login_res.json()["access_token"]

    # Verify /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email

def test_idor_protection_between_citizens():
    # Citizen 1 registers
    c1_email = "citizen1@pune.in"
    client.post("/api/auth/register", json={
        "email": c1_email, "password": "Password123!", "full_name": "Citizen One"
    })
    c1_token = client.post("/api/auth/login", json={
        "email": c1_email, "password": "Password123!"
    }).json()["access_token"]

    # Citizen 2 registers
    c2_email = "citizen2@pune.in"
    client.post("/api/auth/register", json={
        "email": c2_email, "password": "Password123!", "full_name": "Citizen Two"
    })
    c2_token = client.post("/api/auth/login", json={
        "email": c2_email, "password": "Password123!"
    }).json()["access_token"]

    # Citizen 1 submits a report
    fake_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200)
    rep_res = client.post(
        "/api/reports",
        headers={"Authorization": f"Bearer {c1_token}"},
        data={
            "title": "Blocked storm drain near Paud Road",
            "report_type": "plastic_waste",
            "description": "Plastic bottles choking roadside curb",
            "latitude": "18.5074",
            "longitude": "73.8077",
            "address": "Paud Road Pune"
        },
        files={"file": ("test.jpg", fake_img, "image/jpeg")}
    )
    assert rep_res.status_code == 200
    rep_id = rep_res.json()["report_id"]

    # Citizen 1 can fetch report
    c1_fetch = client.get(f"/api/reports/{rep_id}", headers={"Authorization": f"Bearer {c1_token}"})
    assert c1_fetch.status_code == 200

    # Citizen 2 CANNOT fetch Citizen 1's report (IDOR check returns 403)
    c2_fetch = client.get(f"/api/reports/{rep_id}", headers={"Authorization": f"Bearer {c2_token}"})
    assert c2_fetch.status_code == 403

def test_citizen_cannot_access_admin_endpoints():
    # Citizen login
    c_token = client.post("/api/auth/login", json={
        "email": "citizen1@pune.in", "password": "Password123!"
    }).json()["access_token"]

    # Attempt to change report status as citizen
    patch_res = client.patch(
        "/api/reports/REP-NONEXISTENT/status",
        headers={"Authorization": f"Bearer {c_token}"},
        json={"status": "RESOLVED"}
    )
    # Must be 403 Forbidden
    assert patch_res.status_code == 403
    assert "Municipal Administrator credentials required" in patch_res.json()["detail"]

def test_admin_authorized_lifecycle():
    # Login as bootstrapped municipal administrator
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@pmc.gov.in",
        "password": "PuneCivic#2026"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    # Admin can view all reports
    admin_reports = client.get("/api/reports", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_reports.status_code == 200
    assert "reports" in admin_reports.json()

    # If there are reports, admin can update status
    reps = admin_reports.json()["reports"]
    if len(reps) > 0:
        target_id = reps[0]["id"]
        status_res = client.patch(
            f"/api/reports/{target_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "status": "UNDER_REVIEW",
                "assigned_to": "Ward 9 Engineering Crew",
                "authority_notes": "Assigned via administrative test suite"
            }
        )
        assert status_res.status_code == 200

        # Verify audit history
        hist_res = client.get(f"/api/reports/{target_id}/history", headers={"Authorization": f"Bearer {admin_token}"})
        assert hist_res.status_code == 200
        assert len(hist_res.json()["history"]) > 0

def test_explainable_risk_engine():
    geo_data = {
        "drainage_connectivity": "direct_adjacent",
        "drain_distance_m": 15.0,
        "closest_drain": {"name": "Culvert", "capacity_status": "choked"},
        "waterway_risk_flag": True,
        "closest_waterway": {"name": "Mutha River"},
        "uncertainties": []
    }
    
    result = calculate_waterlogging_risk(
        report_type="waterlogging",
        ml_category="Plastic",
        ml_confidence=0.88,
        ml_extent_coverage=65.0,
        geo_data=geo_data
    )

    assert 0 <= result["risk_score"] <= 100
    assert result["risk_level"] in ["CRITICAL", "HIGH"]
    assert len(result["factors"]) >= 4
    assert result["confidence_score"] > 0.6

def test_demo_credentials_and_logins():
    # Verify demo credentials endpoint
    demo_res = client.get("/api/auth/demo-credentials")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["enabled"] is True
    assert demo_data["citizen"]["email"] == "citizen.demo@ecoroute.local"
    assert demo_data["municipal"]["email"] == "municipal.demo@ecoroute.local"

    # Test login with citizen demo account
    c_login = client.post("/api/auth/login", json={
        "email": "citizen.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    assert c_login.status_code == 200
    c_user = c_login.json()["user"]
    assert c_user["role"] == "citizen"

    # Test login with municipal demo account
    m_login = client.post("/api/auth/login", json={
        "email": "municipal.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    assert m_login.status_code == 200
    m_user = m_login.json()["user"]
    assert m_user["role"] == "municipal_admin"

    # Test invalid email format returns 422 with array of validation detail objects
    invalid_email_res = client.post("/api/auth/login", json={
        "email": "notanemail",
        "password": "somepassword"
    })
    assert invalid_email_res.status_code == 422
    assert isinstance(invalid_email_res.json()["detail"], list)

    # Test incorrect password returns 401
    bad_pwd_res = client.post("/api/auth/login", json={
        "email": "citizen.demo@ecoroute.local",
        "password": "WrongPassword123"
    })
    assert bad_pwd_res.status_code == 401
    assert bad_pwd_res.json()["detail"] == "Invalid email or password."

def test_municipal_verification_workflow():
    # 1. Citizen submits report
    c_login = client.post("/api/auth/login", json={
        "email": "citizen.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    c_token = c_login.json()["access_token"]
    c_headers = {"Authorization": f"Bearer {c_token}"}

    m_login = client.post("/api/auth/login", json={
        "email": "municipal.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    m_token = m_login.json()["access_token"]
    m_headers = {"Authorization": f"Bearer {m_token}"}

    # Create dummy image
    image_bytes = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    create_res = client.post(
        "/api/reports",
        headers=c_headers,
        data={
            "title": "Severe Plastic Clog at Deccan Drain",
            "report_type": "plastic_waste",
            "description": "Culvert blocked with bottles",
            "latitude": 18.5167,
            "longitude": 73.8417,
            "address": "Deccan Gymkhana, Pune"
        },
        files={"file": ("clog.png", image_bytes, "image/png")}
    )
    assert create_res.status_code == 200
    rep_id = create_res.json()["report_id"]

    # 2. Citizen attempts to verify (unauthorized) -> must return 403 Forbidden
    unauth_verify = client.post(
        f"/api/reports/{rep_id}/verify",
        headers=c_headers,
        json={"verified_by": "Fake Citizen Verifier"}
    )
    assert unauth_verify.status_code == 403

    # 3. Municipal admin attempts to verify BEFORE resolution photo is uploaded -> must return 400 Bad Request
    no_photo_verify = client.post(
        f"/api/reports/{rep_id}/verify",
        headers=m_headers,
        json={"verified_by": "PMC Drainage Inspector"}
    )
    assert no_photo_verify.status_code == 400
    assert "Resolution photograph evidence must be uploaded" in no_photo_verify.json()["detail"]

    # 4. Municipal admin uploads resolution cleanup evidence
    cleanup_bytes = io.BytesIO(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82")
    cleanup_res = client.post(
        f"/api/reports/{rep_id}/cleanup",
        headers=m_headers,
        data={"notes": "Cleared 40kg plastic waste using suction equipment."},
        files={"file": ("cleanup.png", cleanup_bytes, "image/png")}
    )
    assert cleanup_res.status_code == 200
    assert "cleanup_image_path" in cleanup_res.json()

    # 5. Municipal admin verifies and closes incident
    verify_res = client.post(
        f"/api/reports/{rep_id}/verify",
        headers=m_headers,
        json={
            "verified_by": "Er. Arvind Joshi (PMC Zone 3 Executive Engineer)",
            "authority_notes": "Culvert inspected and cleared. Free hydraulic flow re-established."
        }
    )
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["success"] is True
    assert verify_data["report"]["status"] == "VERIFIED"
    assert verify_data["report"]["cleanup_verified"] == 1
    assert "Arvind Joshi" in verify_data["report"]["cleanup_verified_by"]
    assert verify_data["report"]["cleanup_verified_at"] is not None

    # 6. Citizen fetches their report and confirms VERIFIED status and supervisor info
    citizen_view = client.get(f"/api/reports/{rep_id}", headers=c_headers)
    assert citizen_view.status_code == 200
    rep_data = citizen_view.json()
    assert rep_data["status"] == "VERIFIED"
    assert rep_data["cleanup_verified"] == 1
    assert "Arvind Joshi" in rep_data["cleanup_verified_by"]

    # 7. Check audit history contains status transitions
    hist_res = client.get(f"/api/reports/{rep_id}/history", headers=c_headers)
    assert hist_res.status_code == 200
    history_entries = hist_res.json()["history"]
    to_statuses = [h["to_status"] for h in history_entries]
    assert "IN_PROGRESS" in to_statuses
    assert "VERIFIED" in to_statuses

def test_real_pune_gis_feature_distance():
    """
    Test real distance calculation to verified Pune GIS features.
    Alka Talkies / Deccan coordinate: 18.5204° N, 73.8567° E.
    Mutha River is adjacent (within ~250m) and verified storm drains run along the roadway.
    """
    res = analyze_geographic_context(lat=18.5204, lon=73.8567)

    assert res["coverage_verified"] is True
    # Mutha river boundary distance check
    assert res["waterway_distance_m"] is not None
    assert res["waterway_distance_m"] < 300.0  # Real boundary is ~195m
    wb_name = res["closest_waterway"]["name"].lower()
    assert "मुळा-मुठा नदी" in res["closest_waterway"]["name"] or "mutha" in wb_name or "river" in wb_name

    # Storm drain proximity
    assert res["drain_distance_m"] is not None
    assert res["closest_drain"]["source_dataset"] in [
        "4390b641-12ad-4438-bc6b-c938ea7ae5de.kmz",
        "3f7228b1-092e-4c66-a62f-6895cf33fbcd.kml"
    ]

    # Chamber identification
    assert res["closest_chamber"] is not None
    assert "distance_m" in res["closest_chamber"]
    assert "drainage_verified" in res["closest_chamber"]

def test_out_of_bounds_coverage_flag():
    """
    Test coordinates outside Pune dataset envelope return coverage_verified = False
    and include explicit uncertainty notes.
    """
    # Coordinates in Mumbai (19.0760, 72.8777)
    res = analyze_geographic_context(lat=19.0760, lon=72.8777)
    assert res["coverage_verified"] is False
    assert any("outside the verified Pune Municipal Corporation" in u for u in res["uncertainties"])
    assert res["drain_distance_m"] is None
    assert res["waterway_distance_m"] is None

def test_separation_of_obstruction_and_waterlogging_assessments():
    """
    Test that calculate_waterlogging_risk produces distinct Obstruction Potential
    and Waterlogging Hazard assessments with model limitations.
    """
    geo_data = {
        "drainage_connectivity": "direct_adjacent",
        "drain_distance_m": 12.0,
        "waterway_distance_m": 80.0,
        "closest_drain": {"name": "Storm Drain Line", "source_dataset": "pmc_storm_water_drains"},
        "closest_waterway": {"name": "Mutha River", "source_dataset": "water_bodies"},
        "coverage_verified": True,
        "uncertainties": []
    }

    result = calculate_waterlogging_risk(
        report_type="plastic_waste",
        ml_category="Plastic",
        ml_confidence=0.92,
        ml_extent_coverage=75.0,
        geo_data=geo_data
    )

    # 1. Check separate assessments exist
    assert "plastic_obstruction_assessment" in result
    assert "waterlogging_assessment" in result

    # 2. Obstruction assessment details
    obs = result["plastic_obstruction_assessment"]
    assert obs["level"] in ["HIGH", "CRITICAL"]
    assert any("classifier" in lim.lower() for lim in obs["limitations"])
    assert any("proxy" in lim.lower() or "variance" in lim.lower() or "texture" in lim.lower() for lim in obs["limitations"])

    # 3. Waterlogging assessment details
    wl = result["waterlogging_assessment"]
    assert "score" in wl
    assert "factors" in wl
    assert any("precipitation" in u.lower() for u in wl["uncertainties"])

    # 4. Composite priority
    assert 0 <= result["risk_score"] <= 100
    assert result["risk_level"] in ["HIGH", "CRITICAL"]

def test_municipal_gis_datasets_endpoint():
    """
    Verify the municipal assets endpoint returns both municipal reference assets
    and the 5 imported Pune GIS layer metadata summaries.
    """
    res = client.get("/api/municipal/assets")
    assert res.status_code == 200
    data = res.json()
    assert "assets" in data
    assert "gis_datasets" in data
    assert len(data["gis_datasets"]) == 5
    layer_types = [d["layer_name"] for d in data["gis_datasets"]]
    assert "water_body" in layer_types
    assert "storm_water_drain" in layer_types
    assert "swd_chamber" in layer_types



