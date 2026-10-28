"""
Geographic analysis service for ECO-ROUTE.
Grounds all spatial conclusions on verified Pune Municipal Corporation (PMC) GIS datasets:
- Water Bodies: 12 mapped polygon features (Mula, Mutha, Pavana) from b0d9ef1f-14d7-4c93-a498-3ffb7c86737c.kml
- Storm Water Drains: 9,187 mapped line channels from 4390b641-12ad-4438-bc6b-c938ea7ae5de.kmz
- Natural Drainage Nallas: 6,302 natural canal line channels from 3f7228b1-092e-4c66-a62f-6895cf33fbcd.kml & KMZ
- Stormwater Chambers: 22,771 verified stormwater chambers on roadway right-of-way
- Utility Chambers: 4,233 unverified utility chambers (explicitly flagged as unverified drainage function)

CRITICAL RULES:
1. Calculates genuine geodesic nearest-feature distances using Shapely geometry projection.
2. For polygons (rivers/water bodies), measures distance to the nearest polygon boundary, never just centroid.
3. Distinguishes verified stormwater drainage channels from unverified utility chambers.
4. Does NOT equate proximity to a river or chamber with hydraulic connectivity.
5. If report coordinates fall outside dataset coverage, returns null/unknown and flags coverage gaps honestly.
"""

import math
import json
import sqlite3
from typing import Dict, Any, List, Optional, Tuple
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import nearest_points

from backend.database import get_db_connection

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

# Verified dataset bounding envelope across PMC Pune coverage
PUNE_DATASET_BOUNDS = {
    "min_lat": 18.397,
    "max_lat": 18.630,
    "min_lon": 73.685,
    "max_lon": 74.017
}

# Preloaded water bodies cache in memory for high-speed polygon distance checks
_CACHED_WATER_BODIES: Optional[List[Dict[str, Any]]] = None

def get_cached_water_bodies() -> List[Dict[str, Any]]:
    global _CACHED_WATER_BODIES
    if _CACHED_WATER_BODIES is not None:
        return _CACHED_WATER_BODIES

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, feature_name, geometry_type, coordinates_json, source_dataset, min_lon, max_lon, min_lat, max_lat
        FROM pune_spatial_features
        WHERE layer_type = 'water_body'
    """)
    rows = cursor.fetchall()
    conn.close()

    bodies = []
    for r in rows:
        coords = json.loads(r["coordinates_json"])
        poly = Polygon(coords)
        bodies.append({
            "id": r["id"],
            "name": r["feature_name"],
            "geom": poly,
            "source": r["source_dataset"],
            "min_lon": r["min_lon"],
            "max_lon": r["max_lon"],
            "min_lat": r["min_lat"],
            "max_lat": r["max_lat"]
        })
    _CACHED_WATER_BODIES = bodies
    return _CACHED_WATER_BODIES

def geodesic_point_to_geom_meters(point: Point, geom: Any, lat_rad: float) -> Tuple[float, Point]:
    """
    Computes geodesic distance in meters from point (lon, lat) to a Shapely geometry
    (Polygon boundary or LineString) using local equirectangular projection centered at report latitude.
    """
    kx = 111320.0 * math.cos(lat_rad)
    ky = 110574.0

    if isinstance(geom, Polygon):
        if geom.contains(point):
            return 0.0, point
        # Distance to exterior boundary
        npt = nearest_points(point, geom.exterior)[1]
    elif isinstance(geom, LineString):
        npt = nearest_points(point, geom)[1]
    else:
        npt = geom

    dx = (point.x - npt.x) * kx
    dy = (point.y - npt.y) * ky
    dist_m = math.hypot(dx, dy)
    return dist_m, npt

def analyze_geographic_context(lat: float, lon: float) -> Dict[str, Any]:
    """
    Performs verified geographic analysis relative to Pune Municipal Corporation GIS layers.
    Returns:
    - nearest mapped stormwater drainage asset (distance, type, name, dataset source)
    - nearest mapped water body / river (distance, name, dataset source)
    - nearest chamber (verified SWD vs unverified utility)
    - coverage limitation assessment
    - defensible connectivity & evidence observations
    """
    evidence: List[str] = []
    uncertainties: List[str] = []

    # 1. Check geographic coverage bounds
    within_bounds = (
        PUNE_DATASET_BOUNDS["min_lat"] <= lat <= PUNE_DATASET_BOUNDS["max_lat"] and
        PUNE_DATASET_BOUNDS["min_lon"] <= lon <= PUNE_DATASET_BOUNDS["max_lon"]
    )
    if not within_bounds:
        uncertainties.append(
            f"Coordinates ({lat:.4f}, {lon:.4f}) lie outside the verified Pune Municipal Corporation GIS dataset boundary. Proximity calculations cannot be validated."
        )

    point = Point(lon, lat)
    lat_rad = math.radians(lat)
    kx = 111320.0 * math.cos(lat_rad)
    ky = 110574.0

    # 2. Query nearest Water Body (Mula, Mutha, Pavana rivers and retention bodies)
    water_bodies = get_cached_water_bodies()
    closest_waterway: Optional[Dict[str, Any]] = None
    min_wb_dist = float('inf')

    for wb in water_bodies:
        dist_m, _ = geodesic_point_to_geom_meters(point, wb["geom"], lat_rad)
        if dist_m < min_wb_dist:
            min_wb_dist = dist_m
            closest_waterway = {
                "id": wb["id"],
                "name": wb["name"],
                "distance_m": round(dist_m, 1),
                "source_dataset": wb["source"],
                "asset_type": "water_body",
                "geometry_type": "Polygon"
            }

    # 3. Query nearest Storm Water Drain, Nalla, and Chamber from SQLite spatial features
    # Search within localized spatial window (~2.0 km radius)
    conn = get_db_connection()
    cursor = conn.cursor()

    deg_search = 0.02 # ~2.2 km window
    cursor.execute("""
        SELECT id, feature_name, layer_type, drainage_verified, geometry_type, coordinates_json, source_dataset
        FROM pune_spatial_features
        WHERE min_lon <= ? AND max_lon >= ?
          AND min_lat <= ? AND max_lat >= ?
    """, (lon + deg_search, lon - deg_search, lat + deg_search, lat - deg_search))

    candidate_rows = cursor.fetchall()
    conn.close()

    closest_drain: Optional[Dict[str, Any]] = None
    min_drain_dist = float('inf')

    closest_chamber: Optional[Dict[str, Any]] = None
    min_chamber_dist = float('inf')

    for r in candidate_rows:
        fid = r["id"]
        fname = r["feature_name"]
        ltype = r["layer_type"]
        is_verified = bool(r["drainage_verified"])
        gtype = r["geometry_type"]
        src = r["source_dataset"]
        coords = json.loads(r["coordinates_json"])

        if gtype == 'Point':
            dx = (lon - coords[0]) * kx
            dy = (lat - coords[1]) * ky
            dist_m = math.hypot(dx, dy)
        elif gtype == 'LineString':
            ls = LineString(coords)
            dist_m, _ = geodesic_point_to_geom_meters(point, ls, lat_rad)
        else:
            continue

        # Check drainage channels (SWD & Nalla)
        if ltype in ["storm_water_drain", "natural_nalla"]:
            if dist_m < min_drain_dist:
                min_drain_dist = dist_m
                closest_drain = {
                    "id": fid,
                    "name": fname,
                    "distance_m": round(dist_m, 1),
                    "source_dataset": src,
                    "asset_type": ltype,
                    "drainage_verified": is_verified,
                    "geometry_type": gtype
                }
        # Check chambers
        elif ltype in ["swd_chamber", "utility_chamber"]:
            if dist_m < min_chamber_dist:
                min_chamber_dist = dist_m
                closest_chamber = {
                    "id": fid,
                    "name": fname,
                    "distance_m": round(dist_m, 1),
                    "source_dataset": src,
                    "asset_type": ltype,
                    "drainage_verified": is_verified,
                    "geometry_type": gtype
                }

    # 4. Formulate Defensible Geographic Evidence (Phase 3 requirements)
    drain_dist_val = round(min_drain_dist, 1) if closest_drain and within_bounds else None
    waterway_dist_val = round(min_wb_dist, 1) if (closest_waterway and within_bounds) else None
    chamber_dist_val = round(min_chamber_dist, 1) if closest_chamber and within_bounds else None
    if not within_bounds:
        closest_waterway = None
        closest_drain = None
        closest_chamber = None

    # Replace arbitrary assumptions with measurable proximity & verified status
    if closest_drain and drain_dist_val is not None:
        if drain_dist_val <= 35.0:
            connectivity = "direct_adjacent"
            evidence.append(
                f"Immediate roadway proximity: Located {drain_dist_val}m from mapped {closest_drain['name']} (source: {closest_drain['source_dataset']})."
            )
        elif drain_dist_val <= 120.0:
            connectivity = "nearby_overland"
            evidence.append(
                f"Overland proximity: Located {drain_dist_val}m from mapped {closest_drain['name']}. Hydraulic connectivity is unverified without site inspection."
            )
        else:
            connectivity = "unconnected_or_unknown"
            evidence.append(
                f"Nearest mapped drainage conduit is {drain_dist_val}m away ({closest_drain['name']}). Hydraulic connectivity is unverified."
            )
    else:
        connectivity = "unconnected_or_unknown"
        uncertainties.append("No mapped municipal storm water drain or nalla found within 2km search radius.")

    # Chamber observation: strictly distinguish verified SWD chamber vs utility chamber
    if closest_chamber and chamber_dist_val is not None:
        if closest_chamber["drainage_verified"]:
            evidence.append(
                f"Stormwater chamber detected {chamber_dist_val}m away ({closest_chamber['name']}). Note: Chamber location indicates stormwater network access point, not guaranteed gravity inlet."
            )
        else:
            uncertainties.append(
                f"Nearest chamber at {chamber_dist_val}m is a municipal utility chamber ({closest_chamber['name']}); its drainage intake capacity is unverified."
            )

    # Waterway proximity: Measured distance without assuming flood or inflow connectivity
    waterway_risk_flag = False
    if closest_waterway and waterway_dist_val is not None:
        if waterway_dist_val <= 100.0:
            waterway_risk_flag = True
            evidence.append(
                f"Riparian proximity: Located {waterway_dist_val}m from {closest_waterway['name']} boundary (source: {closest_waterway['source_dataset']}). Note: Proximity to water body does not establish drainage discharge or backflow without hydraulic gradient evidence."
            )
        else:
            evidence.append(
                f"Nearest mapped river/water body is {closest_waterway['name']} ({waterway_dist_val}m away)."
            )
    else:
        uncertainties.append("No primary river or open water body found within dataset coverage.")

    # Elevation or slope: Flag as unknown unless digital elevation model is verified
    elevation_risk = "unknown"
    uncertainties.append("Elevation, slope, and topographic contours are unverified: no LiDAR or verified high-resolution DEM is integrated.")

    return {
        "drain_distance_m": drain_dist_val,
        "waterway_distance_m": waterway_dist_val,
        "closest_drain": closest_drain,
        "closest_waterway": closest_waterway,
        "closest_chamber": closest_chamber,
        "drainage_connectivity": connectivity,
        "elevation_risk": elevation_risk,
        "waterway_risk_flag": waterway_risk_flag,
        "coverage_verified": within_bounds,
        "evidence": evidence,
        "uncertainties": uncertainties
    }
