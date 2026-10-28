export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'citizen' | 'municipal_admin';
  ward?: string;
}

export interface MunicipalAsset {
  id: string;
  asset_type: 'storm_drain' | 'culvert' | 'catch_basin' | 'river' | 'canal' | 'retention_pond';
  name: string;
  latitude: number;
  longitude: number;
  capacity_status: 'normal' | 'high_silt' | 'choked' | 'unknown';
  flow_direction_deg: number;
  description: string;
}

export interface PredictionItem {
  category: string;
  probability: number;
}

export interface RiskFactor {
  dimension: string;
  points: number;
  rationale: string;
}

export interface GisDatasetInfo {
  filename: string;
  layer_name: string;
  feature_count: number;
  geometry_type: string;
  bounds_json: string;
  imported_at: string;
}

export interface ObstructionAssessment {
  score: number;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  limitations: string[];
  recommendation: string;
  rationale?: string;
}

export interface WaterloggingAssessment {
  score: number;
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  factors: RiskFactor[];
  uncertainties: string[];
  telemetry_gaps?: string[];
  recommendation: string;
  rationale?: string;
}

export interface GeoEvidence {
  drain_distance_m: number | null;
  waterway_distance_m: number | null;
  closest_drain?: any;
  closest_waterway?: any;
  closest_chamber?: any;
  drainage_connectivity: 'direct_adjacent' | 'nearby_overland' | 'unconnected_or_unknown';
  elevation_risk: string;
  waterway_risk_flag: boolean;
  coverage_verified?: boolean;
  evidence: string[];
  uncertainties: string[];
}

export interface ReportItem {
  id: string;
  citizen_id: string;
  title: string;
  report_type: 'plastic_waste' | 'waterlogging';
  description: string;
  image_path: string;
  cleanup_image_path?: string | null;
  latitude: number;
  longitude: number;
  address: string;

  // ML Analysis
  ml_category: string;
  ml_confidence: number;
  ml_all_predictions?: PredictionItem[];
  ml_extent_coverage: number;
  ml_status: string;
  model_version?: string;

  // Geo Analysis
  drain_distance_m: number | null;
  waterway_distance_m: number | null;
  drainage_connectivity: 'direct_adjacent' | 'nearby_overland' | 'unconnected_or_unknown';
  elevation_risk: string;
  waterway_risk_flag: boolean;
  geo_evidence?: GeoEvidence;

  // Risk Engine
  risk_score: number;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  risk_factors?: RiskFactor[];
  confidence_score: number;
  recommended_action: string;
  plastic_obstruction_assessment?: ObstructionAssessment;
  waterlogging_assessment?: WaterloggingAssessment;

  // Municipal Workflow
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'VERIFIED' | 'REJECTED';
  assigned_to?: string | null;
  authority_notes?: string | null;
  cleanup_verified: number;
  cleanup_verified_at?: string | null;
  cleanup_verified_by?: string | null;
  is_synthetic: number;
  created_at: string;
  updated_at: string;
}

export interface StatusHistoryItem {
  id: number;
  report_id: string;
  from_status: string;
  to_status: string;
  changed_by_user_id: string;
  changed_by_name: string;
  notes: string | null;
  created_at: string;
}

export interface PerClassMetric {
  precision: number;
  recall: number;
  f1_score: number;
  support: number;
}

export interface ModelMetrics {
  architecture: string;
  pretrained_source: string;
  dataset: string;
  license: string;
  classes: string[];
  num_classes: number;
  splits: {
    train_samples: number;
    val_samples: number;
    test_samples: number;
    total_samples: number;
    split_ratio: string;
  };
  final_val_accuracy: number;
  training_time_seconds: number;
  history: Array<{
    epoch: number;
    train_loss: number;
    train_acc: number;
    val_loss: number;
    val_acc: number;
  }>;
  test_evaluation: {
    test_accuracy: number;
    macro_avg: {
      precision: number;
      recall: number;
      f1_score: number;
    };
    per_class: Record<string, PerClassMetric>;
    confusion_matrix: number[][];
  };
  taco_investigation: {
    status: string;
    findings: string;
  };
}
