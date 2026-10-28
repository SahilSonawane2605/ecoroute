"""
Optional Development-Only Fixtures Generator.
DISABLED BY DEFAULT.
Only runs when explicitly invoked with --force-dev-fixture or when ECOROUTE_ENABLE_DEV_FIXTURES=1.
All generated records are visibly flagged with `is_synthetic = 1` and titled '[SYNTHETIC TEST FIXTURE]'.
"""

import os
import json
import uuid
import shutil
import glob
import argparse
from datetime import datetime, timezone
from backend.database import get_db_connection, init_db
from backend.services.ml_service import predict_image
from backend.services.geo_service import analyze_geographic_context
from backend.services.risk_engine import calculate_waterlogging_risk

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_DIR = os.path.join(ROOT_DIR, "uploads")
REALWASTE_DIR = os.path.join(ROOT_DIR, "realwaste", "realwaste-main", "RealWaste")

def seed_development_fixtures(citizen_id: str = "DEV_CITIZEN_01"):
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    os.makedirs(UPLOADS_DIR, exist_ok=True)

    samples = [
        {
            "id": "SYNTH-8012A",
            "title": "[SYNTHETIC TEST FIXTURE] Arterial Culvert Grate Testing Record",
            "report_type": "plastic_waste",
            "description": "Synthetic testing fixture for validating municipal desilting triage queue.",
            "category_folder": "Plastic",
            "lat": 18.5146,
            "lon": 73.7802,
            "address": "Bavdhan Main Road Test Corridor",
            "status": "ASSIGNED",
            "assigned_to": "Ward 9 Sanitation Crew",
            "authority_notes": "Development fixture record for workflow testing."
        }
    ]

    now = datetime.now(timezone.utc).isoformat()

    for item in samples:
        folder = os.path.join(REALWASTE_DIR, item["category_folder"])
        img_files = glob.glob(os.path.join(folder, "*"))
        if not img_files:
            continue

        src_img = img_files[0]
        dest_filename = f"synth_{item['id']}.jpg"
        dest_path = os.path.join(UPLOADS_DIR, dest_filename)
        shutil.copyfile(src_img, dest_path)
        rel_img_path = f"/uploads/{dest_filename}"

        ml_res = predict_image(dest_path)
        geo_res = analyze_geographic_context(item["lat"], item["lon"])
        risk_res = calculate_waterlogging_risk(
            report_type=item["report_type"],
            ml_category=ml_res["category"],
            ml_confidence=ml_res["confidence"],
            ml_extent_coverage=ml_res["extent_coverage"],
            geo_data=geo_res
        )

        cursor.execute("""
            INSERT INTO reports (
                id, citizen_id, title, report_type, description, image_path, cleanup_image_path,
                latitude, longitude, address,
                ml_category, ml_confidence, ml_all_predictions, ml_extent_coverage, ml_status, model_version,
                drain_distance_m, waterway_distance_m, drainage_connectivity, elevation_risk, waterway_risk_flag, geo_evidence,
                risk_score, risk_level, risk_factors, confidence_score, recommended_action,
                status, assigned_to, authority_notes, cleanup_verified, cleanup_verified_at, cleanup_verified_by,
                is_synthetic, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            item["id"], citizen_id, item["title"], item["report_type"], item["description"], rel_img_path, None,
            item["lat"], item["lon"], item["address"],
            ml_res["category"], ml_res["confidence"], json.dumps(ml_res["all_predictions"]), ml_res["extent_coverage"], ml_res["status"], "mobilenetv3-realwaste-v1",
            geo_res["drain_distance_m"], geo_res["waterway_distance_m"], geo_res["drainage_connectivity"], geo_res["elevation_risk"], geo_res["waterway_risk_flag"], json.dumps(geo_res),
            risk_res["risk_score"], risk_res["risk_level"], json.dumps(risk_res["factors"]), risk_res["confidence_score"], risk_res["recommended_action"],
            item["status"], item.get("assigned_to"), item.get("authority_notes"), 0, None, None,
            1, now, now
        ))

    conn.commit()
    conn.close()
    print("Synthetic development fixtures created and clearly labeled (is_synthetic=1).")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Synthetic Development Fixtures")
    parser.add_argument("--force-dev-fixture", action="store_true", help="Explicitly allow generating test fixtures")
    args = parser.parse_args()

    if args.force_dev_fixture or os.environ.get("ECOROUTE_ENABLE_DEV_FIXTURES") == "1":
        seed_development_fixtures()
    else:
        print("Dev fixtures are DISABLED by default. Pass --force-dev-fixture to generate clearly labeled test data.")
