import os
import json
import uuid
import shutil
import re
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

from backend.database import get_db_connection, init_db
from backend.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_municipal_admin
)
from backend.services.ml_service import predict_image, get_model_info, MODEL_VERSION
from backend.services.geo_service import analyze_geographic_context
from backend.services.risk_engine import calculate_waterlogging_risk

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Allowed upload extensions and max size (10 MB)
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

init_db()

app = FastAPI(
    title="ECO-ROUTE Platform API",
    description="Plastic Waste and Urban Waterlogging Intelligence Platform API for Pune",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# --- Schemas ---

class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=2, max_length=100)
    ward: Optional[str] = "Pune Citizen"

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Please provide a valid email address.")
        return v.strip().lower()

class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Please provide a valid email address.")
        return v.strip().lower()

class StatusUpdateRequest(BaseModel):
    status: str
    assigned_to: Optional[str] = None
    authority_notes: Optional[str] = None

class VerificationRequest(BaseModel):
    verified_by: str = Field(min_length=2, max_length=150)
    authority_notes: Optional[str] = None

# --- Auth Routes ---

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register_citizen(payload: RegisterRequest):
    """Citizen self-registration. Role is strictly defaulted to 'citizen'."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email = ?", (payload.email.strip().lower(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="An account with this email address already exists.")

    user_id = f"CIT-{uuid.uuid4().hex[:8].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    hashed = hash_password(payload.password)

    cursor.execute("""
        INSERT INTO users (id, email, hashed_password, full_name, role, ward, created_at, is_active)
        VALUES (?, ?, ?, ?, 'citizen', ?, ?, 1)
    """, (user_id, payload.email.strip().lower(), hashed, payload.full_name.strip(), payload.ward or "Pune Citizen", now))
    conn.commit()
    conn.close()

    token = create_access_token({"sub": user_id, "role": "citizen", "name": payload.full_name.strip()})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": payload.email.strip().lower(),
            "full_name": payload.full_name.strip(),
            "role": "citizen",
            "ward": payload.ward or "Pune Citizen"
        }
    }

@app.post("/api/auth/login")
def login_user(payload: LoginRequest):
    """Authenticates both citizens and municipal administrators and returns a role-bearing JWT."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, hashed_password, full_name, role, ward, is_active FROM users WHERE email = ?", (payload.email.strip().lower(),))
    user = cursor.fetchone()
    conn.close()

    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account has been deactivated. Please contact support.")

    token = create_access_token({"sub": user["id"], "role": user["role"], "name": user["full_name"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "ward": user["ward"]
        }
    }

@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Returns the authenticated user's profile."""
    return {"user": current_user}

@app.get("/api/auth/demo-credentials")
def get_demo_credentials():
    """
    Returns development demo credentials for evaluation only when enabled.
    Disabled in production (ECOROUTE_ENV=production).
    """
    env = os.environ.get("ECOROUTE_ENV", "development").lower()
    enable_demo = os.environ.get("ECOROUTE_ENABLE_DEMO_CREDENTIALS", "1") == "1"

    if env == "production" or not enable_demo:
        return {"enabled": False}

    demo_password = os.environ.get("ECOROUTE_DEMO_PASSWORD", "PuneEco#Demo2026")
    return {
        "enabled": True,
        "citizen": {
            "email": "citizen.demo@ecoroute.local",
            "password": demo_password,
            "role": "citizen",
            "description": "Citizen submission & My Reports tracking"
        },
        "municipal": {
            "email": "municipal.demo@ecoroute.local",
            "password": demo_password,
            "role": "municipal_admin",
            "description": "Municipal triage, dispatch & resolution management"
        }
    }

# --- System & Model Metadata ---

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "platform": "ECO-ROUTE Platform v2.0.0"
    }

@app.get("/api/model/info")
def model_information():
    """Returns verified evaluation metrics and training history from the real dataset splits."""
    return get_model_info()

@app.get("/api/municipal/assets")
def get_municipal_assets():
    """
    Returns mapped Pune municipal drainage network references and spatial layer summaries.
    Includes verified reference landmarks and genuine GIS layers from Pune Municipal Corporation data.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM municipal_assets")
    assets = [dict(row) for row in cursor.fetchall()]

    # Fetch dataset metadata and summary counts from imported PMC GIS layers
    cursor.execute("SELECT filename, layer_name, feature_count, geometry_type, bounds_json, imported_at FROM gis_datasets")
    datasets = [dict(row) for row in cursor.fetchall()]

    # Sample representative real GIS landmarks (rivers, nallas, primary SWD channels)
    cursor.execute("""
        SELECT id, layer_type, feature_name, geometry_type, min_lon, max_lon, min_lat, max_lat, source_dataset
        FROM pune_spatial_features
        WHERE layer_type = 'water_body'
    """)
    wb_samples = []
    for r in cursor.fetchall():
        center_lat = (r["min_lat"] + r["max_lat"]) / 2.0
        center_lon = (r["min_lon"] + r["max_lon"]) / 2.0
        wb_samples.append({
            "id": r["id"],
            "asset_type": "river",
            "name": r["feature_name"] or "Pune Waterway",
            "latitude": center_lat,
            "longitude": center_lon,
            "capacity_status": "normal",
            "flow_direction_deg": 300.0,
            "description": f"Verified water body polygon from {r['source_dataset']}"
        })

    # Combine landmarks
    combined_assets = assets + wb_samples
    conn.close()

    return {
        "assets": combined_assets,
        "count": len(combined_assets),
        "gis_datasets": datasets
    }

# --- Report Management Routes ---

@app.get("/api/reports")
def list_reports(
    report_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query(None),
    order: Optional[str] = Query("desc"),
    limit: Optional[int] = Query(100),
    offset: Optional[int] = Query(0),
    current_user: dict = Depends(get_current_user)
):
    """
    Role-isolated reports listing:
    - Citizens see ONLY their own submitted reports, ordered by submission date DESC by default.
    - Municipal admins see all reports for authorized municipal triage, ordered by risk_score DESC by default.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM reports WHERE 1=1"
    params = []

    # Enforce data isolation: citizen sees only their own reports
    if current_user["role"] == "citizen":
        query += " AND citizen_id = ?"
        params.append(current_user["id"])

    if report_type and report_type != "all":
        query += " AND report_type = ?"
        params.append(report_type)
    if status and status != "all":
        query += " AND status = ?"
        params.append(status)
    if risk_level and risk_level != "all":
        query += " AND risk_level = ?"
        params.append(risk_level)
    if search and search.strip():
        query += " AND (title LIKE ? OR description LIKE ? OR address LIKE ? OR ml_category LIKE ? OR id LIKE ?)"
        wildcard = f"%{search.strip()}%"
        params.extend([wildcard, wildcard, wildcard, wildcard, wildcard])

    # Determine sort order
    allowed_sorts = {
        "risk_score": "risk_score",
        "created_at": "created_at",
        "updated_at": "updated_at",
        "status": "status",
        "drain_distance_m": "drain_distance_m"
    }
    direction = "ASC" if (order and order.lower() == "asc") else "DESC"
    
    if sort_by and sort_by in allowed_sorts:
        sort_col = allowed_sorts[sort_by]
    elif current_user["role"] == "municipal_admin":
        # Municipal officers need actionable priority first (high risk score, then newest)
        sort_col = "risk_score"
    else:
        sort_col = "created_at"

    # Get total count before pagination
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    query += f" ORDER BY {sort_col} {direction}, created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    reports = []
    for r in rows:
        item = dict(r)
        for field in ["ml_all_predictions", "geo_evidence", "risk_factors", "plastic_obstruction_assessment", "waterlogging_assessment"]:
            if item.get(field):
                try:
                    item[field] = json.loads(item[field])
                except Exception:
                    pass
        reports.append(item)

    return {"reports": reports, "count": len(reports), "total": total_count}

@app.get("/api/reports/{report_id}")
def get_report(report_id: str, current_user: dict = Depends(get_current_user)):
    """
    IDOR-Protected single report retrieval.
    Citizens can only view their own reports; administrators can view any report.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Incident report not found.")

    item = dict(row)
    if current_user["role"] == "citizen" and item["citizen_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden: You do not have permission to view this report.")

    for field in ["ml_all_predictions", "geo_evidence", "risk_factors", "plastic_obstruction_assessment", "waterlogging_assessment"]:
        if item.get(field):
            try:
                item[field] = json.loads(item[field])
            except Exception:
                pass
    return item

@app.post("/api/reports")
async def create_report(
    file: UploadFile = File(...),
    title: str = Form("Drainage Hazard Report"),
    report_type: str = Form("plastic_waste"),
    description: Optional[str] = Form(""),
    latitude: float = Form(...),
    longitude: float = Form(...),
    address: Optional[str] = Form("Pune Municipal Area"),
    current_user: dict = Depends(get_current_user)
):
    """
    Submits a genuine citizen incident report.
    1. Validates file format and size
    2. Runs inference using fine-tuned MobileNetV3-Small checkpoint
    3. Analyzes geographic drain proximity
    4. Computes explainable risk score
    5. Saves report linked strictly to current_user['id']
    """
    # Validate file extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Allowed image formats: JPG, JPEG, PNG, WEBP."
        )

    # Save uploaded file
    file_id = str(uuid.uuid4())
    safe_filename = f"{file_id}{ext}"
    local_path = os.path.join(UPLOADS_DIR, safe_filename)

    file_size = 0
    with open(local_path, "wb") as buffer:
        while chunk := await file.read(1024 * 64):
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE_BYTES:
                buffer.close()
                if os.path.exists(local_path):
                    os.remove(local_path)
                raise HTTPException(status_code=400, detail="Uploaded file exceeds 10 MB maximum limit.")
            buffer.write(chunk)

    image_rel_url = f"/uploads/{safe_filename}"

    # Real ML Inference
    ml_result = predict_image(local_path)

    # Geographic Proximity & Drainage Connectivity Analysis
    geo_result = analyze_geographic_context(latitude, longitude)

    # Explainable Risk Engine
    risk_result = calculate_waterlogging_risk(
        report_type=report_type,
        ml_category=ml_result["category"],
        ml_confidence=ml_result["confidence"],
        ml_extent_coverage=ml_result["extent_coverage"],
        geo_data=geo_result
    )

    now = datetime.now(timezone.utc).isoformat()
    report_id = f"REP-{file_id[:8].upper()}"

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO reports (
            id, citizen_id, title, report_type, description, image_path,
            latitude, longitude, address,
            ml_category, ml_confidence, ml_all_predictions, ml_extent_coverage, ml_status, model_version,
            drain_distance_m, waterway_distance_m, drainage_connectivity, elevation_risk, waterway_risk_flag, geo_evidence,
            risk_score, risk_level, risk_factors, confidence_score, recommended_action,
            plastic_obstruction_assessment, waterlogging_assessment,
            status, is_synthetic, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?,
            'SUBMITTED', 0, ?, ?
        )
    """, (
        report_id, current_user["id"], title.strip(), report_type, description.strip() if description else "", image_rel_url,
        latitude, longitude, address.strip() if address else "Pune Municipal Area",
        ml_result["category"], ml_result["confidence"], json.dumps(ml_result["all_predictions"]), ml_result["extent_coverage"], ml_result["status"], MODEL_VERSION,
        geo_result["drain_distance_m"], geo_result["waterway_distance_m"], geo_result["drainage_connectivity"], geo_result["elevation_risk"], geo_result["waterway_risk_flag"], json.dumps(geo_result),
        risk_result["risk_score"], risk_result["risk_level"], json.dumps(risk_result["factors"]), risk_result["confidence_score"], risk_result["recommended_action"],
        json.dumps(risk_result.get("plastic_obstruction_assessment")), json.dumps(risk_result.get("waterlogging_assessment")),
        now, now
    ))

    # Log initial status history
    cursor.execute("""
        INSERT INTO status_history (report_id, from_status, to_status, changed_by_user_id, changed_by_name, notes, created_at)
        VALUES (?, 'NONE', 'SUBMITTED', ?, ?, 'Incident reported by citizen', ?)
    """, (report_id, current_user["id"], current_user["full_name"], now))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "report_id": report_id,
        "latitude": latitude,
        "longitude": longitude,
        "address": address.strip() if address else "Pune Municipal Area",
        "risk_score": risk_result["risk_score"],
        "risk_level": risk_result["risk_level"],
        "ml_category": ml_result["category"],
        "recommended_action": risk_result["recommended_action"]
    }

# --- Municipal Administrator Workflow Routes ---

@app.patch("/api/reports/{report_id}/status")
def update_report_status(
    report_id: str,
    payload: StatusUpdateRequest,
    admin_user: dict = Depends(require_municipal_admin)
):
    """
    Municipal Staff Only:
    Transitions report status through the authorized lifecycle:
    SUBMITTED -> UNDER_REVIEW -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> VERIFIED / REJECTED
    Logs complete status audit trail into status_history.
    """
    valid_statuses = {"SUBMITTED", "UNDER_REVIEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "VERIFIED", "REJECTED"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status '{payload.status}'. Valid transitions: {list(valid_statuses)}")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, status FROM reports WHERE id = ?", (report_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Incident report not found.")

    old_status = row["status"]
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
        UPDATE reports 
        SET status = ?, assigned_to = COALESCE(?, assigned_to), 
            authority_notes = COALESCE(?, authority_notes), updated_at = ?
        WHERE id = ?
    """, (payload.status, payload.assigned_to, payload.authority_notes, now, report_id))

    cursor.execute("""
        INSERT INTO status_history (report_id, from_status, to_status, changed_by_user_id, changed_by_name, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (report_id, old_status, payload.status, admin_user["id"], admin_user["full_name"], payload.authority_notes or "Status update by administrator", now))

    conn.commit()
    conn.close()

    return {"success": True, "report_id": report_id, "status": payload.status}

@app.post("/api/reports/{report_id}/cleanup")
async def upload_cleanup_evidence(
    report_id: str,
    file: UploadFile = File(...),
    notes: Optional[str] = Form("Cleanup conducted by municipal quick-response team."),
    admin_user: dict = Depends(require_municipal_admin)
):
    """Municipal Staff Only: Upload resolution / cleanup photograph (After evidence)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid image extension for resolution photo.")

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, status FROM reports WHERE id = ?", (report_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Incident report not found.")

    file_id = str(uuid.uuid4())
    safe_filename = f"cleanup_{file_id}{ext}"
    local_path = os.path.join(UPLOADS_DIR, safe_filename)

    with open(local_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    cleanup_rel_url = f"/uploads/{safe_filename}"
    now = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
        UPDATE reports
        SET cleanup_image_path = ?, status = 'IN_PROGRESS', 
            authority_notes = COALESCE(?, authority_notes), updated_at = ?
        WHERE id = ?
    """, (cleanup_rel_url, notes, now, report_id))

    cursor.execute("""
        INSERT INTO status_history (report_id, from_status, to_status, changed_by_user_id, changed_by_name, notes, created_at)
        VALUES (?, ?, 'IN_PROGRESS', ?, ?, ?, ?)
    """, (report_id, row["status"], admin_user["id"], admin_user["full_name"], "Cleanup photo evidence uploaded", now))

    conn.commit()
    conn.close()

    return {"success": True, "cleanup_image_path": cleanup_rel_url}

@app.post("/api/reports/{report_id}/verify")
def verify_cleanup(
    report_id: str,
    payload: VerificationRequest,
    admin_user: dict = Depends(require_municipal_admin)
):
    """
    Municipal Supervisor Verification:
    Strictly requires authenticated municipal administrator.
    Validates that resolution photographic evidence has been uploaded before closing/verifying.
    Persists verification timestamp, supervisor identity, notes, and records audit trail.
    """
    verifier_name = payload.verified_by.strip()
    if not verifier_name:
        raise HTTPException(
            status_code=400,
            detail="Supervisor name and designation are required for verification sign-off."
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Incident report not found.")

    # REQUIREMENT 7: Enforce that resolution photograph is required before verification
    if not row["cleanup_image_path"] or not str(row["cleanup_image_path"]).strip():
        conn.close()
        raise HTTPException(
            status_code=400,
            detail="Resolution photograph evidence must be uploaded and saved before municipal verification."
        )

    now = datetime.now(timezone.utc).isoformat()
    verification_notes = payload.authority_notes.strip() if payload.authority_notes else "Site inspected. Conduits verified free of obstruction."

    cursor.execute("""
        UPDATE reports
        SET cleanup_verified = 1,
            cleanup_verified_at = ?,
            cleanup_verified_by = ?,
            status = 'VERIFIED',
            authority_notes = ?,
            updated_at = ?
        WHERE id = ?
    """, (now, verifier_name, verification_notes, now, report_id))

    audit_note = f"Verified & Closed by {verifier_name}. Notes: {verification_notes}"
    cursor.execute("""
        INSERT INTO status_history (report_id, from_status, to_status, changed_by_user_id, changed_by_name, notes, created_at)
        VALUES (?, ?, 'VERIFIED', ?, ?, ?, ?)
    """, (report_id, row["status"], admin_user["id"], admin_user["full_name"], audit_note, now))

    conn.commit()

    # Re-fetch updated report to return full synchronized representation
    cursor.execute("SELECT * FROM reports WHERE id = ?", (report_id,))
    updated_row = cursor.fetchone()
    conn.close()

    updated_report = dict(updated_row)
    for field in ["ml_all_predictions", "geo_evidence", "risk_factors"]:
        if updated_report.get(field):
            try:
                updated_report[field] = json.loads(updated_report[field])
            except Exception:
                pass

    return {
        "success": True,
        "message": f"Incident {report_id} successfully verified and closed.",
        "report": updated_report
    }

@app.get("/api/reports/{report_id}/history")
def get_report_history(report_id: str, current_user: dict = Depends(get_current_user)):
    """Returns the full audit trail of status transitions for an incident."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check report ownership for citizens
    cursor.execute("SELECT citizen_id FROM reports WHERE id = ?", (report_id,))
    rep = cursor.fetchone()
    if not rep:
        conn.close()
        raise HTTPException(status_code=404, detail="Report not found.")
    if current_user["role"] == "citizen" and rep["citizen_id"] != current_user["id"]:
        conn.close()
        raise HTTPException(status_code=403, detail="Forbidden.")

    cursor.execute("SELECT * FROM status_history WHERE report_id = ? ORDER BY id ASC", (report_id,))
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"history": history}
