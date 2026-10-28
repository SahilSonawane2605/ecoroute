import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "ecoroute.db")

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Users Table (Role-based access: citizen vs municipal_admin)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'citizen', -- 'citizen' or 'municipal_admin'
        ward TEXT, -- e.g. 'Ward 9 - Kothrud/Bavdhan'
        created_at TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1
    )
    """)

    # 2. Reports Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        citizen_id TEXT NOT NULL,
        title TEXT NOT NULL,
        report_type TEXT NOT NULL, -- 'plastic_waste' or 'waterlogging'
        description TEXT,
        image_path TEXT NOT NULL,
        cleanup_image_path TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        address TEXT,
        
        -- ML inference results
        ml_category TEXT,
        ml_confidence REAL,
        ml_all_predictions TEXT, -- JSON string
        ml_extent_coverage REAL, -- Estimated visible blockage/extent %
        ml_status TEXT, -- 'completed', 'fallback', 'error'
        model_version TEXT, -- e.g. 'mobilenet_v3_small-realwaste-v1'
        
        -- Geographic analysis results
        drain_distance_m REAL,
        waterway_distance_m REAL,
        drainage_connectivity TEXT, -- 'direct_adjacent', 'nearby_overland', 'unconnected_or_unknown'
        elevation_risk TEXT, -- 'lowland_depression', 'moderate_slope', 'highland'
        waterway_risk_flag BOOLEAN,
        geo_evidence TEXT, -- JSON breakdown of facts
        
        -- Explainable Risk engine output
        risk_score INTEGER NOT NULL, -- 0-100
        risk_level TEXT NOT NULL, -- 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'
        risk_factors TEXT NOT NULL, -- JSON array of factor explanations
        confidence_score REAL NOT NULL, -- 0.0-1.0
        recommended_action TEXT NOT NULL,
        
        -- Workflow tracking
        status TEXT NOT NULL DEFAULT 'SUBMITTED', -- 'SUBMITTED', 'UNDER_REVIEW', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'REJECTED'
        assigned_to TEXT,
        authority_notes TEXT,
        cleanup_verified BOOLEAN DEFAULT 0,
        cleanup_verified_at TEXT,
        cleanup_verified_by TEXT,
        is_synthetic BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (citizen_id) REFERENCES users (id)
    )
    """)

    # Safe migration: ensure citizen_id and model_version exist if table was previously created
    cursor.execute("PRAGMA table_info(reports)")
    columns = [col[1] for col in cursor.fetchall()]
    if "citizen_id" not in columns:
        cursor.execute("ALTER TABLE reports ADD COLUMN citizen_id TEXT DEFAULT 'system_migrated'")
    if "model_version" not in columns:
        cursor.execute("ALTER TABLE reports ADD COLUMN model_version TEXT DEFAULT 'mobilenetv3-realwaste-v1'")
    if "is_synthetic" not in columns:
        cursor.execute("ALTER TABLE reports ADD COLUMN is_synthetic BOOLEAN DEFAULT 0")
    if "plastic_obstruction_assessment" not in columns:
        cursor.execute("ALTER TABLE reports ADD COLUMN plastic_obstruction_assessment TEXT")
    if "waterlogging_assessment" not in columns:
        cursor.execute("ALTER TABLE reports ADD COLUMN waterlogging_assessment TEXT")

    # 3. Status History Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        changed_by_user_id TEXT NOT NULL,
        changed_by_name TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (report_id) REFERENCES reports (id)
    )
    """)

    # 4. Verified Municipal Infrastructure Reference (Ground truth Pune drainage network)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS municipal_assets (
        id TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL, -- 'storm_drain', 'culvert', 'catch_basin', 'river', 'canal', 'retention_pond'
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        capacity_status TEXT, -- 'normal', 'high_silt', 'choked', 'unknown'
        flow_direction_deg REAL,
        description TEXT
    )
    """)

    cursor.execute("SELECT COUNT(*) FROM municipal_assets")
    if cursor.fetchone()[0] == 0:
        seed_assets = [
            ("DRAIN_001", "storm_drain", "Bavdhan Arterial Roadbox Culvert", 18.5145, 73.7801, "choked", 135.0, "Major roadside concrete culvert prone to leaf & plastic debris accumulation"),
            ("DRAIN_002", "catch_basin", "Kothrud Depot Storm Drain Inlet", 18.5074, 73.8077, "high_silt", 90.0, "Main intake box receiving storm runoff from hill slopes"),
            ("DRAIN_003", "storm_drain", "Shivajinagar Underpass Drain System", 18.5314, 73.8446, "high_silt", 180.0, "Critical underpass sump pump and gravitational drain grid"),
            ("DRAIN_004", "catch_basin", "Hadapsar Industrial Drainage Canal Head", 18.5089, 73.9259, "normal", 45.0, "Covered box drain connected to canal"),
            ("DRAIN_005", "storm_drain", "Deccan Gymkhana Riverside Outfall", 18.5182, 73.8415, "choked", 270.0, "Natural outfall channel feeding into Mutha riverbed"),
            ("WATERWAY_001", "river", "Mutha River Main Course", 18.5167, 73.8398, "normal", 300.0, "Primary regional drainage river artery"),
            ("WATERWAY_002", "canal", "Mutha Right Bank Canal", 18.5020, 73.8340, "high_silt", 120.0, "Secondary irrigation and spillway drainage canal"),
            ("WATERWAY_003", "canal", "Ramnadi Stream & Wetland Corridor", 18.5290, 73.7780, "choked", 160.0, "Natural feeder stream prone to monsoon flash overflows")
        ]
        cursor.executemany("""
            INSERT INTO municipal_assets (id, asset_type, name, latitude, longitude, capacity_status, flow_direction_deg, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_assets)

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at", DB_PATH)
