"""
Importer and converter for official Pune Municipal Corporation (PMC) GIS datasets:
Located in backend/PUNES data/:
1. b0d9ef1f-14d7-4c93-a498-3ffb7c86737c.kml -> PMC Water Bodies (Mula, Mutha, Pavana, etc.)
2. 3f7228b1-092e-4c66-a62f-6895cf33fbcd.kml -> PMC Natural Nallas (Natural stormwater drainage canals, Phase I & II)
3. 4390b641-12ad-4438-bc6b-c938ea7ae5de.kmz -> PMC Storm Water Drains (9,187 mapped SWD channels + 3,227 Nallas; sewage separated)
4. pmc_swd_chambers.kml -> Verified Stormwater Chambers (22,771 chambers on road right-of-way)
5. pmc_swd_utlitiy_chambers.kml -> Utility Chambers (4,233 chambers - explicitly tagged with drainage_function_verified = 0)

Extracts and indexes genuine Pune geometry into SQLite with spatial indexing (R-Tree / indexed bounding boxes)
for sub-millisecond geodesic distance queries to polygons, lines, and point chambers.
"""

import os
import sys
import hashlib
import zipfile
import sqlite3
import json
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Tuple, Optional

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT_DIR, "backend", "PUNES data")
DB_PATH = os.path.join(ROOT_DIR, "data", "ecoroute.db")

def compute_file_hash(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def init_geo_tables(conn: sqlite3.Connection):
    cursor = conn.cursor()
    
    # Track imported files to prevent duplicate imports
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gis_datasets (
        filename TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL,
        layer_name TEXT NOT NULL,
        feature_count INTEGER NOT NULL,
        geometry_type TEXT NOT NULL,
        bounds_json TEXT NOT NULL,
        imported_at TEXT NOT NULL
    )
    """)

    # Unified spatial features table for Pune
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pune_spatial_features (
        id TEXT PRIMARY KEY,
        source_dataset TEXT NOT NULL,
        layer_type TEXT NOT NULL,          -- 'water_body', 'natural_nalla', 'storm_water_drain', 'swd_chamber', 'utility_chamber'
        drainage_verified BOOLEAN NOT NULL,-- 1 for verified stormwater assets; 0 for unverified utility chambers
        feature_name TEXT,
        original_id TEXT,
        geometry_type TEXT NOT NULL,       -- 'Polygon', 'LineString', 'Point'
        coordinates_json TEXT NOT NULL,    -- GeoJSON-like [[lon, lat], ...] or [[[lon, lat], ...]]
        min_lon REAL NOT NULL,
        max_lon REAL NOT NULL,
        min_lat REAL NOT NULL,
        max_lat REAL NOT NULL,
        attributes_json TEXT
    )
    """)

    # Indices for high-speed bounding box spatial pre-filtering
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_spatial_layer ON pune_spatial_features (layer_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_spatial_bounds ON pune_spatial_features (min_lon, max_lon, min_lat, max_lat)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_spatial_source ON pune_spatial_features (source_dataset)")

    conn.commit()

def parse_water_bodies(filepath: str) -> List[Dict[str, Any]]:
    features = []
    root = ET.parse(filepath).getroot()
    for elem in root.iter():
        if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]

    for pm in root.findall('.//Placemark'):
        sdata = {sd.get('name'): sd.text for sd in pm.findall('.//SimpleData') or []}
        name_elem = pm.find('name')
        name_str = (name_elem.text.strip() if name_elem is not None and name_elem.text else '') or sdata.get('REMARK') or f"Water Body {sdata.get('OBJECTID_1', '')}"
        
        c_elem = pm.find('.//coordinates')
        if c_elem is None or not c_elem.text: continue
        coords = []
        for token in c_elem.text.strip().split():
            parts = token.split(',')
            if len(parts) >= 2:
                try:
                    coords.append([float(parts[0]), float(parts[1])])
                except ValueError:
                    pass
        if len(coords) < 3: continue

        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        
        obj_id = sdata.get('OBJECTID_1') or str(len(features) + 1)
        features.append({
            "id": f"WB_{obj_id}",
            "source_dataset": os.path.basename(filepath),
            "layer_type": "water_body",
            "drainage_verified": 1,
            "feature_name": name_str,
            "original_id": obj_id,
            "geometry_type": "Polygon",
            "coordinates": coords,
            "min_lon": min(lons),
            "max_lon": max(lons),
            "min_lat": min(lats),
            "max_lat": max(lats),
            "attributes": sdata
        })
    return features

def parse_natural_nallas(filepath: str) -> List[Dict[str, Any]]:
    features = []
    root = ET.parse(filepath).getroot()
    for elem in root.iter():
        if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]

    for pm in root.findall('.//Placemark'):
        sdata = {sd.get('name'): sd.text for sd in pm.findall('.//SimpleData') or []}
        nid = sdata.get('id') or f"Nalla.{len(features) + 1}"
        phase = sdata.get('phase', '')
        name_str = f"Natural Nalla ({phase}) - {nid}" if phase else f"Natural Nalla - {nid}"
        
        c_elem = pm.find('.//coordinates')
        if c_elem is None or not c_elem.text: continue
        coords = []
        for token in c_elem.text.strip().split():
            parts = token.split(',')
            if len(parts) >= 2:
                try:
                    coords.append([float(parts[0]), float(parts[1])])
                except ValueError:
                    pass
        if len(coords) < 2: continue

        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]

        features.append({
            "id": f"KML_NALLA_{sdata.get('objectid', len(features)+1)}",
            "source_dataset": os.path.basename(filepath),
            "layer_type": "natural_nalla",
            "drainage_verified": 1,
            "feature_name": name_str,
            "original_id": nid,
            "geometry_type": "LineString",
            "coordinates": coords,
            "min_lon": min(lons),
            "max_lon": max(lons),
            "min_lat": min(lats),
            "max_lat": max(lats),
            "attributes": sdata
        })
    return features

def parse_swd_chambers(filepath: str) -> List[Dict[str, Any]]:
    features = []
    root = ET.parse(filepath).getroot()
    for elem in root.iter():
        if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]

    for pm in root.findall('.//Placemark'):
        sdata = {sd.get('name'): sd.text for sd in pm.findall('.//SimpleData') or []}
        oid = sdata.get('objectid') or str(len(features) + 1)
        diam = sdata.get('pipediamet', 'Unknown')
        name_str = f"Stormwater Chamber #{oid} (Pipe {diam}mm)"

        c_elem = pm.find('.//coordinates')
        if c_elem is None or not c_elem.text: continue
        token = c_elem.text.strip().split()[0]
        parts = token.split(',')
        if len(parts) < 2: continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue

        features.append({
            "id": f"SWD_CH_{oid}",
            "source_dataset": os.path.basename(filepath),
            "layer_type": "swd_chamber",
            "drainage_verified": 1,
            "feature_name": name_str,
            "original_id": oid,
            "geometry_type": "Point",
            "coordinates": [lon, lat],
            "min_lon": lon,
            "max_lon": lon,
            "min_lat": lat,
            "max_lat": lat,
            "attributes": sdata
        })
    return features

def parse_utility_chambers(filepath: str) -> List[Dict[str, Any]]:
    features = []
    root = ET.parse(filepath).getroot()
    for elem in root.iter():
        if '}' in elem.tag: elem.tag = elem.tag.split('}', 1)[1]

    for pm in root.findall('.//Placemark'):
        sdata = {sd.get('name'): sd.text for sd in pm.findall('.//SimpleData') or []}
        oid = sdata.get('objectid') or str(len(features) + 1)
        name_str = f"Utility Chamber #{oid} (Drainage Unverified)"

        c_elem = pm.find('.//coordinates')
        if c_elem is None or not c_elem.text: continue
        token = c_elem.text.strip().split()[0]
        parts = token.split(',')
        if len(parts) < 2: continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue

        features.append({
            "id": f"UTIL_CH_{oid}",
            "source_dataset": os.path.basename(filepath),
            "layer_type": "utility_chamber",
            "drainage_verified": 0,  # Unverified utility chamber
            "feature_name": name_str,
            "original_id": oid,
            "geometry_type": "Point",
            "coordinates": [lon, lat],
            "min_lon": lon,
            "max_lon": lon,
            "min_lat": lat,
            "max_lat": lat,
            "attributes": sdata
        })
    return features

def parse_kmz_storm_drains(filepath: str) -> List[Dict[str, Any]]:
    """
    Parses 4390b641-12ad-4438-bc6b-c938ea7ae5de.kmz.
    Filters specifically for stormwater drainage features:
    - 'Storm water drains' (9,187 features)
    - 'Nalla' (3,227 features)
    Excludes pure sanitary Road_Sewer (122,737 lines) to avoid skewing stormwater drainage analysis.
    """
    features = []
    with zipfile.ZipFile(filepath, "r") as z:
        with z.open("pmc_storm_water_drains.kml") as f:
            for event, elem in ET.iterparse(f, events=('end',)):
                tag = elem.tag.split('}')[-1]
                if tag == 'Placemark':
                    cat = None
                    sdata = {}
                    c_text = None
                    for child in elem.iter():
                        ctag = child.tag.split('}')[-1]
                        if ctag == 'SimpleData':
                            sdata[child.get('name')] = child.text
                            if child.get('name') == 'category':
                                cat = child.text
                        elif ctag == 'coordinates':
                            c_text = child.text

                    if cat in ['Storm water drains', 'Nalla'] and c_text:
                        coords = []
                        for token in c_text.strip().split():
                            parts = token.split(',')
                            if len(parts) >= 2:
                                try:
                                    coords.append([float(parts[0]), float(parts[1])])
                                except ValueError:
                                    pass
                        if len(coords) >= 2:
                            lons = [c[0] for c in coords]
                            lats = [c[1] for c in coords]
                            oid = sdata.get('id') or sdata.get('OBJECTID') or str(len(features) + 1)
                            basin = sdata.get('basin_name') or 'Pune Basin'
                            
                            layer_type = "storm_water_drain" if cat == "Storm water drains" else "natural_nalla"
                            feat_name = f"Storm Water Drain ({basin})" if cat == "Storm water drains" else f"Nalla Channel ({basin})"

                            features.append({
                                "id": f"KMZ_SWD_{sdata.get('OBJECTID', len(features)+1)}",
                                "source_dataset": os.path.basename(filepath),
                                "layer_type": layer_type,
                                "drainage_verified": 1,
                                "feature_name": feat_name,
                                "original_id": str(oid),
                                "geometry_type": "LineString",
                                "coordinates": coords,
                                "min_lon": min(lons),
                                "max_lon": max(lons),
                                "min_lat": min(lats),
                                "max_lat": max(lats),
                                "attributes": sdata
                            })
                    elem.clear()
    return features

def run_import(force: bool = False):
    print("=" * 60)
    print("ECO-ROUTE Pune Municipal GIS Data Importer")
    print("=" * 60)
    
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    init_geo_tables(conn)
    cursor = conn.cursor()

    files = [
        ("b0d9ef1f-14d7-4c93-a498-3ffb7c86737c.kml", parse_water_bodies, "water_body"),
        ("3f7228b1-092e-4c66-a62f-6895cf33fbcd.kml", parse_natural_nallas, "natural_nalla"),
        ("pmc_swd_chambers.kml", parse_swd_chambers, "swd_chamber"),
        ("pmc_swd_utlitiy_chambers.kml", parse_utility_chambers, "utility_chamber"),
        ("4390b641-12ad-4438-bc6b-c938ea7ae5de.kmz", parse_kmz_storm_drains, "storm_water_drain")
    ]

    for fname, parser_func, layer_desc in files:
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            print(f"Skipping missing file: {fname}")
            continue

        file_hash = compute_file_hash(fpath)

        # Check if already imported
        cursor.execute("SELECT sha256 FROM gis_datasets WHERE filename = ?", (fname,))
        row = cursor.fetchone()
        if row and row[0] == file_hash and not force:
            print(f"✓ {fname} already imported (SHA256 matches). Skipping.")
            continue

        print(f"Importing {fname} ({layer_desc})...")
        features = parser_func(fpath)
        print(f"  Parsed {len(features)} verified features.")

        # Delete previous entries from this dataset
        cursor.execute("DELETE FROM pune_spatial_features WHERE source_dataset = ?", (fname,))
        
        # Batch insert
        records = [
            (
                f["id"],
                f["source_dataset"],
                f["layer_type"],
                f["drainage_verified"],
                f["feature_name"],
                f["original_id"],
                f["geometry_type"],
                json.dumps(f["coordinates"]),
                f["min_lon"],
                f["max_lon"],
                f["min_lat"],
                f["max_lat"],
                json.dumps(f["attributes"])
            )
            for f in features
        ]

        cursor.executemany("""
        INSERT OR REPLACE INTO pune_spatial_features (
            id, source_dataset, layer_type, drainage_verified, feature_name, original_id,
            geometry_type, coordinates_json, min_lon, max_lon, min_lat, max_lat, attributes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, records)

        bounds = {
            "min_lon": min([f["min_lon"] for f in features]) if features else None,
            "max_lon": max([f["max_lon"] for f in features]) if features else None,
            "min_lat": min([f["min_lat"] for f in features]) if features else None,
            "max_lat": max([f["max_lat"] for f in features]) if features else None
        }

        from datetime import datetime, timezone
        now_str = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
        INSERT OR REPLACE INTO gis_datasets (filename, sha256, layer_name, feature_count, geometry_type, bounds_json, imported_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (fname, file_hash, layer_desc, len(features), features[0]["geometry_type"] if features else "None", json.dumps(bounds), now_str))

        conn.commit()
        print(f"  Saved {len(features)} records to pune_spatial_features.")

    # Summary
    cursor.execute("SELECT layer_type, COUNT(*), drainage_verified FROM pune_spatial_features GROUP BY layer_type, drainage_verified")
    print("\n--- Imported Spatial Layers Summary ---")
    for r in cursor.fetchall():
        v_str = "Verified Drainage" if r[2] else "Unverified Utility"
        print(f"Layer: {r[0]:<20} | Count: {r[1]:<7} | Status: {v_str}")
    
    conn.close()
    print("\n✓ Geographic integration complete.")

if __name__ == "__main__":
    force_run = "--force" in sys.argv
    run_import(force=force_run)
