"""
Explainable Risk Engine for ECO-ROUTE.
Produces TWO distinct, scientifically defensible assessments (Phase 4):

1. PLASTIC OBSTRUCTION POTENTIAL:
   - Evaluates solid waste material clogging propensity (MobileNetV3 classification on RealWaste)
   - Evaluates proximity to genuine mapped drainage channels and chambers
   - Explicitly notes ML limitations (material classification != drain-blockage detector;
     image variance coverage != calibrated area segmentation)
   - Produces an interpretable Obstruction Level (LOW, MODERATE, HIGH, CRITICAL) with clear caveats.

2. WATERLOGGING ASSESSMENT:
   - Evaluates whether an active inundation/standing water event was reported or observed
   - Evaluates proximity to natural waterways / floodplains
   - Separates verified observations from unknown rainfall, unmapped micro-gradients, and soil saturation
   - Produces a transparent Waterlogging Risk Assessment.

Maintains complete backward compatibility with the existing frontend schema:
risk_score (0-100 overall composite priority for triage), risk_level, risk_factors,
confidence_score, recommended_action, plus structured separate assessments.
"""

from typing import Dict, Any, List, Optional

def assess_plastic_obstruction_potential(
    ml_category: str,
    ml_confidence: float,
    ml_extent_coverage: float,
    geo_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates solid waste obstruction potential based strictly on available evidence.
    Acknowledges model limitations:
    - MobileNetV3-Small is a 9-class material classifier, not a drain-blockage detector.
    - ml_extent_coverage is heuristic image texture variance, not volumetric waste measurement.
    """
    factors: List[Dict[str, Any]] = []
    points = 0

    # 1. Material Clog Propensity
    clog_weights = {
        "Plastic": 35,
        "Textile Trash": 25,
        "Paper": 18,
        "Cardboard": 20,
        "Miscellaneous Trash": 15,
        "Food Organics": 12,
        "Vegetation": 15,
        "Metal": 8,
        "Glass": 5
    }
    cat_pts = clog_weights.get(ml_category, 15)
    points += cat_pts
    factors.append({
        "dimension": f"Waste Material Propensity: {ml_category}",
        "points": cat_pts,
        "rationale": (
            f"Classified as '{ml_category}' with {round(ml_confidence * 100, 1)}% classifier confidence. "
            "Thin films and plastic containers are prone to forming impermeable hydraulic seals against drain grates."
            if ml_category == "Plastic" else
            f"Classified as '{ml_category}'. Non-plastic solid waste can obstruct flow if trapped against conduit inlets."
        )
    })

    # 2. Accumulation Area Proxy
    if ml_extent_coverage >= 50.0:
        area_pts = 25
        area_text = f"Substantial visual debris field (~{int(ml_extent_coverage)}% FOV texture variance)."
    elif ml_extent_coverage >= 25.0:
        area_pts = 15
        area_text = f"Moderate visual debris field (~{int(ml_extent_coverage)}% FOV texture variance)."
    else:
        area_pts = 8
        area_text = f"Isolated visual debris pocket (~{int(ml_extent_coverage)}% FOV texture variance)."
    points += area_pts
    factors.append({
        "dimension": "Visual Accumulation Extent",
        "points": area_pts,
        "rationale": f"{area_text} Note: Texture variance proxy; not a calibrated physical volume."
    })

    # 3. Drainage Conduit Proximity
    drain_dist = geo_data.get("drain_distance_m")
    closest_drain = geo_data.get("closest_drain")

    d_name = closest_drain.get('name', 'drain') if closest_drain else 'drain'
    if drain_dist is not None:
        if drain_dist <= 35.0:
            drain_pts = 30
            drain_text = f"Directly adjacent to mapped {d_name} ({drain_dist}m). High likelihood of intake grate clogging during stormwater runoff."
        elif drain_dist <= 120.0:
            drain_pts = 15
            drain_text = f"Overland flow corridor to mapped {d_name} ({drain_dist}m). Debris requires heavy overland stormwater mobilization to reach inlet."
        elif drain_dist <= 300.0:
            drain_pts = 5
            drain_text = f"Neighborhood proximity ({drain_dist}m to {d_name}). Direct intake connectivity is unverified."
        else:
            drain_pts = 0
            dist_km = round(drain_dist / 1000.0, 1)
            drain_text = f"Distant drainage conduit ({dist_km} km to {d_name}). Zero direct intake obstruction contribution."
    else:
        drain_pts = 0
        drain_text = "No mapped storm water drains located in local dataset coverage."
    points += drain_pts
    factors.append({
        "dimension": "Conduit Proximity",
        "points": drain_pts,
        "rationale": drain_text
    })

    # Limitations explicitly documented
    limitations = [
        "Material classifier (MobileNetV3-Small) identifies debris surface type, not whether conduit grates are fully sealed.",
        "Image texture coverage is a 2D proxy and cannot measure subsurface volume or siltation depth.",
        "Unmapped private inlets or curb openings cannot be evaluated without ground-truth municipal surveys."
    ]

    total_score = min(100, points)
    if total_score >= 70:
        level = "HIGH"
        rec = "High obstruction potential: Dispatch sanitation crew to clear debris from drain perimeter."
    elif total_score >= 40:
        level = "MODERATE"
        rec = "Moderate obstruction potential: Include in regular ward desilting and sweep rotation."
    else:
        level = "LOW"
        rec = "Low obstruction potential: Monitor on standard municipal maintenance schedule."

    return {
        "score": total_score,
        "level": level,
        "factors": factors,
        "limitations": limitations,
        "recommendation": rec
    }

def assess_waterlogging_hazard(
    report_type: str,
    geo_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates waterlogging hazard based on observed flooding evidence and waterway proximity.
    Separates verified observations from missing rainfall or topographical data.
    """
    factors: List[Dict[str, Any]] = []
    points = 0

    # 1. Observed Incident Nature
    if report_type == "waterlogging":
        obs_pts = 50
        points += obs_pts
        factors.append({
            "dimension": "Observed Inundation",
            "points": obs_pts,
            "rationale": "Citizen confirmed active standing water on roadway, disrupting pedestrian or vehicular traffic."
        })
    else:
        obs_pts = 10
        points += obs_pts
        factors.append({
            "dimension": "Preventative Inundation Risk",
            "points": obs_pts,
            "rationale": "Dry accumulation reported. Inundation is contingent on rainfall intensity and drainage capacity."
        })

    # 2. Riparian / Waterway Floodplain Proximity
    waterway_dist = geo_data.get("waterway_distance_m")
    closest_wb = geo_data.get("closest_waterway")

    wb_name = closest_wb.get('name', 'water body') if closest_wb else 'waterway'
    if waterway_dist is not None:
        if waterway_dist <= 100.0:
            wb_pts = 30
            wb_text = f"Direct riparian buffer: Located {waterway_dist}m from {wb_name}. High floodplain backflow or bank overtopping risk during peak discharge."
        elif waterway_dist <= 300.0:
            wb_pts = 15
            wb_text = f"Active river corridor: Located {waterway_dist}m from {wb_name}. Lowland drainage corridor; potential backwater impact during severe monsoon discharge."
        elif waterway_dist <= 800.0:
            wb_pts = 5
            wb_text = f"Intermediate floodplain buffer: Located {waterway_dist}m from {wb_name}. Direct hydraulic connection is unverified without ground inspection."
        else:
            wb_pts = 0
            dist_km = round(waterway_dist / 1000.0, 1)
            wb_text = f"Distant waterway ({dist_km} km to {wb_name}). Zero floodplain hazard contribution; local runoff depends entirely on neighborhood street drains."
    else:
        wb_pts = 0
        wb_text = "No open waterway or river mapped within verified dataset coverage."
    points += wb_pts
    factors.append({
        "dimension": "Water Body Proximity",
        "points": wb_pts,
        "rationale": wb_text
    })

    # 3. Known Coverage Gaps
    uncertainties = [
        "Real-time precipitation and rainfall gauge telemetry are not connected.",
        "Groundwater table and soil infiltration rates are unmeasured.",
        "Micro-topographical depressions require calibrated digital elevation models."
    ]

    total_score = min(100, points)
    if total_score >= 60:
        level = "HIGH"
        action = "High waterlogging risk: Alert zonal drainage engineer to inspect outfall and deploy emergency suction pumps if rain persists."
    elif total_score >= 35:
        level = "MODERATE"
        action = "Moderate waterlogging vulnerability: Monitor catchment during monsoon precipitation."
    else:
        level = "LOW"
        action = "Low waterlogging risk: Normal drainage runoff conditions expected."

    return {
        "score": total_score,
        "level": level,
        "factors": factors,
        "uncertainties": uncertainties,
        "recommendation": action
    }

def calculate_waterlogging_risk(
    report_type: str,
    ml_category: str,
    ml_confidence: float,
    ml_extent_coverage: float,
    geo_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Master explainable risk engine method.
    Produces two distinct assessments and generates a defensible composite priority.
    """
    obstruction_assessment = assess_plastic_obstruction_potential(
        ml_category=ml_category,
        ml_confidence=ml_confidence,
        ml_extent_coverage=ml_extent_coverage,
        geo_data=geo_data
    )

    waterlogging_assessment = assess_waterlogging_hazard(
        report_type=report_type,
        geo_data=geo_data
    )

    # Composite priority score for municipal dispatch queue (0-100)
    # Balanced weighting: 50% obstruction hazard + 50% waterlogging hazard
    composite_score = int(round(
        (obstruction_assessment["score"] * 0.5) + (waterlogging_assessment["score"] * 0.5)
    ))
    composite_score = max(0, min(100, composite_score))

    if composite_score >= 75:
        risk_level = "CRITICAL"
        recommended_action = "Critical Municipal Priority: Immediate field dispatch. Clear drain blockage and verify gravity outflow."
    elif composite_score >= 50:
        risk_level = "HIGH"
        recommended_action = "Priority Municipal Triage: Schedule sanitation crew within 12 hours before storm event."
    elif composite_score >= 25:
        risk_level = "MODERATE"
        recommended_action = "Standard Maintenance: Add to ward sanitation schedule for next-shift street sweeping."
    else:
        risk_level = "LOW"
        recommended_action = "Monitored: Low hydraulic risk. Schedule regular weekly maintenance."

    # Combined factors for frontend rendering
    combined_factors = obstruction_assessment["factors"] + waterlogging_assessment["factors"]

    # Overall confidence score: combines ML prediction accuracy and GIS coverage verification
    geo_confidence = 0.85 if geo_data.get("coverage_verified", True) else 0.5
    overall_confidence = round((ml_confidence * 0.6) + (geo_confidence * 0.4), 2)

    return {
        "risk_score": composite_score,
        "risk_level": risk_level,
        "factors": combined_factors,
        "confidence_score": overall_confidence,
        "recommended_action": recommended_action,
        "plastic_obstruction_assessment": obstruction_assessment,
        "waterlogging_assessment": waterlogging_assessment
    }
