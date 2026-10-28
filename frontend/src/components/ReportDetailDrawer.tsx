import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  ShieldAlert,
  MapPin,
  Sparkles,
  CheckCircle,
  Upload,
  Send,
  X,
  History,
  Lock,
  AlertCircle,
  Check,
  Droplets
} from 'lucide-react';
import type { ReportItem, User, StatusHistoryItem } from '../types';
import { formatApiErrorMessage } from '../utils/errorFormatter';

interface ReportDetailDrawerProps {
  report: ReportItem | null;
  currentUser: User | null;
  token: string | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function ReportDetailDrawer({
  report,
  currentUser,
  token,
  onClose,
  onRefresh
}: ReportDetailDrawerProps) {
  const [status, setStatus] = useState<string>(report?.status || 'SUBMITTED');
  const [assignedTo, setAssignedTo] = useState<string>(report?.assigned_to || '');
  const [authorityNotes, setAuthorityNotes] = useState<string>(report?.authority_notes || '');
  const [isUpdating, setIsUpdating] = useState(false);

  // Status history audit trail
  const [history, setHistory] = useState<StatusHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Cleanup upload state
  const [cleanupFile, setCleanupFile] = useState<File | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<string | null>(null);
  const [isUploadingCleanup, setIsUploadingCleanup] = useState(false);

  // Supervisor verification
  const [verifierName, setVerifierName] = useState(currentUser?.full_name || 'Senior Drainage Inspector');
  const [isVerifying, setIsVerifying] = useState(false);

  // Feedback notifications
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Synchronize internal state whenever report updates (e.g. from background polling or onRefresh)
  useEffect(() => {
    if (report) {
      setStatus(report.status);
      setAssignedTo(report.assigned_to || '');
      setAuthorityNotes(report.authority_notes || '');
      setCleanupPreview(report.cleanup_image_path || null);
      setFeedbackError(null);
    }
  }, [report]);

  if (!report) return null;

  const isMunicipalAdmin = currentUser?.role === 'municipal_admin';

  const fetchHistory = async () => {
    if (!token) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setShowHistory(true);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!token || !isMunicipalAdmin) return;
    setIsUpdating(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status,
          assigned_to: assignedTo,
          authority_notes: authorityNotes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedbackSuccess('Incident status updated and logged to audit trail.');
        onRefresh();
      } else {
        setFeedbackError(formatApiErrorMessage(data, 'Failed to update incident status.'));
      }
    } catch (err) {
      setFeedbackError(formatApiErrorMessage(err, 'Network connection failure while updating status.'));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUploadCleanup = async (e: FormEvent) => {
    e.preventDefault();
    if (!cleanupFile || !token || !isMunicipalAdmin) return;

    setIsUploadingCleanup(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const formData = new FormData();
      formData.append('file', cleanupFile);
      formData.append('notes', authorityNotes || 'Debris cleared from drainage perimeter.');

      const res = await fetch(`/api/reports/${report.id}/cleanup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCleanupFile(null);
        setCleanupPreview(data.cleanup_image_path || null);
        setFeedbackSuccess('Resolution photograph uploaded successfully. Ready for supervisor sign-off.');
        onRefresh();
      } else {
        setFeedbackError(formatApiErrorMessage(data, 'Failed to upload resolution evidence photograph.'));
      }
    } catch (err) {
      setFeedbackError(formatApiErrorMessage(err, 'Network error while uploading resolution photo.'));
    } finally {
      setIsUploadingCleanup(false);
    }
  };

  const handleVerify = async () => {
    if (!token || !isMunicipalAdmin) return;

    // Check evidence presence before submitting
    if (!report.cleanup_image_path) {
      setFeedbackError('Resolution photograph evidence must be uploaded and saved before municipal verification.');
      return;
    }

    if (!verifierName.trim()) {
      setFeedbackError('Supervisor name and designation are required for verification sign-off.');
      return;
    }

    setIsVerifying(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const res = await fetch(`/api/reports/${report.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          verified_by: verifierName.trim(),
          authority_notes: authorityNotes || 'Site inspected. Conduits verified free of obstruction.',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFeedbackSuccess(data.message || `Incident ${report.id} successfully verified and closed.`);
        onRefresh();
        // Automatically refresh audit history if visible
        if (showHistory) {
          fetchHistory();
        }
      } else {
        setFeedbackError(formatApiErrorMessage(data, 'Verification failed.'));
      }
    } catch (err) {
      setFeedbackError(formatApiErrorMessage(err, 'Network error while attempting municipal verification.'));
    } finally {
      setIsVerifying(false);
    }
  };

  const isCritical = report.risk_score >= 75;
  const isHigh = report.risk_score >= 50 && report.risk_score < 75;
  const isModerate = report.risk_score >= 25 && report.risk_score < 50;

  const riskBadgeClass = isCritical
    ? 'bg-red-50 text-red-700 border-red-200'
    : isHigh
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : isModerate
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <>
      <div 
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-2xs transition-opacity"
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-900">{report.id}</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${riskBadgeClass}`}>
                Risk: {report.risk_score}/100 • {report.risk_level}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 font-medium">
                {report.status}
              </span>
              {report.is_synthetic ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-mono">
                  SYNTHETIC FIXTURE
                </span>
              ) : null}
            </div>
            <h2 className="text-sm font-semibold text-slate-900 mt-1 line-clamp-1">{report.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Notification / Feedback Alerts */}
          {feedbackError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 font-medium">{feedbackError}</div>
              <button onClick={() => setFeedbackError(null)} className="text-red-400 hover:text-red-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {feedbackSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-start gap-2 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <div className="flex-1 font-medium">{feedbackSuccess}</div>
              <button onClick={() => setFeedbackSuccess(null)} className="text-emerald-400 hover:text-emerald-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Citizen Verification Banner (Always visible to citizens when incident is verified) */}
          {Boolean(report.cleanup_verified) && (
            <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg space-y-1.5 shadow-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-emerald-900 text-xs uppercase tracking-wider">
                    Municipal Verification & Incident Closure Confirmed
                  </h3>
                  <p className="text-[11px] text-emerald-700">
                    Drainage conduits have been inspected and confirmed clear by municipal authorities.
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-emerald-200/60 grid grid-cols-2 gap-2 text-[11px] text-slate-700">
                <div>
                  <span className="text-slate-500">Verified By:</span>{' '}
                  <span className="font-semibold text-slate-800">{report.cleanup_verified_by || 'Municipal Field Inspector'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Sign-off Timestamp:</span>{' '}
                  <span className="font-mono text-[10px] text-slate-700">
                    {report.cleanup_verified_at ? new Date(report.cleanup_verified_at).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}
          {/* Visual Evidence (Before & After) */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Photographic Evidence</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-slate-500 mb-1 font-medium">Citizen Report (Before)</div>
                <div className="h-40 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                  <img src={report.image_path} alt="Reported Condition" className="w-full h-full object-cover" />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 mb-1 font-medium">
                  {report.cleanup_verified ? 'Verified Resolution (After)' : 'Resolution Progress (After)'}
                </div>
                <div className="h-40 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                  {report.cleanup_image_path ? (
                    <img src={report.cleanup_image_path} alt="Resolution Condition" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-3 text-[11px] text-slate-400">
                      Pending resolution photo upload
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Location & Context */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
            <div className="flex items-start gap-1.5 text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-slate-900">{report.address}</div>
                <div className="text-[11px] font-mono text-slate-500">
                  Coordinates: {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                </div>
              </div>
            </div>
            {report.description && (
              <p className="text-[11px] text-slate-600 pt-1.5 border-t border-slate-200 mt-1.5">
                "{report.description}"
              </p>
            )}
          </div>

          {/* RealWaste ML Inference Breakdown */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>RealWaste ML Inference</span>
              </div>
              <span className="font-mono text-slate-600 font-semibold text-[11px]">
                {Math.round(report.ml_confidence * 100)}% Confidence
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <div className="text-slate-500 text-[11px]">Primary Waste Category:</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{report.ml_category}</div>
              </div>
              <div className="bg-white p-2.5 rounded border border-slate-200">
                <div className="text-slate-500 text-[11px]">Estimated Visible Extent:</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">~{report.ml_extent_coverage}% Area</div>
              </div>
            </div>

            {report.ml_all_predictions && report.ml_all_predictions.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11px] text-slate-500 font-medium">Candidate Category Probabilities:</div>
                <div className="space-y-1">
                  {report.ml_all_predictions.slice(0, 3).map((p, idx) => (
                    <div key={idx} className="flex items-center">
                      <span className="w-28 truncate text-slate-700">{p.category}</span>
                      <div className="flex-1 bg-slate-200 rounded-full h-1.5 mx-2 overflow-hidden">
                        <div
                          className="bg-emerald-700 h-1.5 rounded-full"
                          style={{ width: `${Math.round(p.probability * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono text-slate-500 text-[11px]">
                        {Math.round(p.probability * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dual Explainable Assessments (Phase 4 Separation) */}
          <div className="space-y-3">
            {/* Assessment A: Plastic Obstruction Potential */}
            {report.plastic_obstruction_assessment ? (
              <div className="p-3.5 bg-white rounded-lg border border-amber-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    <span>A. Plastic Obstruction Potential</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    report.plastic_obstruction_assessment.level === 'HIGH' || report.plastic_obstruction_assessment.level === 'CRITICAL'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : report.plastic_obstruction_assessment.level === 'MODERATE'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {report.plastic_obstruction_assessment.level} ({report.plastic_obstruction_assessment.score}/100)
                  </span>
                </div>

                <div className="text-[11px] text-slate-700 bg-amber-50/50 p-2 rounded border border-amber-100">
                  <div className="font-semibold text-amber-900 mb-0.5">Evidence & Rationale:</div>
                  <p className="leading-relaxed">{report.plastic_obstruction_assessment.rationale || report.plastic_obstruction_assessment.recommendation}</p>
                </div>

                {report.plastic_obstruction_assessment.limitations && report.plastic_obstruction_assessment.limitations.length > 0 && (
                  <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-slate-400" />
                      <span>Model & Detection Limitations:</span>
                    </div>
                    <ul className="list-disc pl-3.5 space-y-0.5">
                      {report.plastic_obstruction_assessment.limitations.map((lim: string, i: number) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            {/* Assessment B: Waterlogging Hazard Assessment */}
            {report.waterlogging_assessment ? (
              <div className="p-3.5 bg-white rounded-lg border border-blue-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950 text-xs">
                    <Droplets className="w-3.5 h-3.5 text-blue-600" />
                    <span>B. Waterlogging Hazard Assessment</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    report.waterlogging_assessment.level === 'HIGH' || report.waterlogging_assessment.level === 'CRITICAL'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : report.waterlogging_assessment.level === 'MODERATE'
                      ? 'bg-sky-100 text-sky-800 border border-sky-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {report.waterlogging_assessment.level} ({report.waterlogging_assessment.score}/100)
                  </span>
                </div>

                <div className="text-[11px] text-slate-700 bg-blue-50/50 p-2 rounded border border-blue-100">
                  <div className="font-semibold text-blue-900 mb-0.5">Hydraulic Context:</div>
                  <p className="leading-relaxed">{report.waterlogging_assessment.rationale || report.waterlogging_assessment.recommendation}</p>
                </div>

                {((report.waterlogging_assessment.telemetry_gaps && report.waterlogging_assessment.telemetry_gaps.length > 0) ||
                  (report.waterlogging_assessment.uncertainties && report.waterlogging_assessment.uncertainties.length > 0)) && (
                  <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-slate-400" />
                      <span>Telemetry & Hydraulic Gaps:</span>
                    </div>
                    <ul className="list-disc pl-3.5 space-y-0.5">
                      {(report.waterlogging_assessment.telemetry_gaps || report.waterlogging_assessment.uncertainties || []).map((gap: string, i: number) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Genuine Pune GIS Reference & Geodesic Proximity */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                <span>Geospatial Intelligence & Proximity (Pune Datasets)</span>
              </div>
              {report.geo_evidence?.coverage_verified ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                  PMC Coverage Verified
                </span>
              ) : (
                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                  Outside Verified Bounds
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 text-[11px]">
              {/* Nearest Storm Drain Conduit */}
              <div className="p-2 bg-white rounded border border-slate-200">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Nearest Storm Conduit / Nalla:</span>
                  <span className="font-bold text-slate-900">
                    {report.drain_distance_m !== null && report.drain_distance_m !== undefined
                      ? `${report.drain_distance_m} m`
                      : 'Unknown / Not Mapped'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                  <span>Name: {report.geo_evidence?.closest_drain?.name || 'Natural Storm Drain'}</span>
                  <span>Dataset: {report.geo_evidence?.closest_drain?.source_dataset || 'SWD Network'}</span>
                </div>
              </div>

              {/* Nearest River / Waterbody Shoreline */}
              <div className="p-2 bg-white rounded border border-slate-200">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-500">Nearest River Shoreline:</span>
                  <span className="font-bold text-slate-900">
                    {report.waterway_distance_m !== null && report.waterway_distance_m !== undefined
                      ? `${report.waterway_distance_m} m`
                      : 'Unknown / Not Mapped'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                  <span>Name: {report.geo_evidence?.closest_waterway?.name || 'Water Body'}</span>
                  <span>Dataset: {report.geo_evidence?.closest_waterway?.source_dataset || 'Water Bodies Layer'}</span>
                </div>
              </div>

              {/* Nearest Chamber */}
              {report.geo_evidence?.closest_chamber && (
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-500">Nearest Chamber Asset:</span>
                    <span className="font-bold text-slate-900">
                      {report.geo_evidence.closest_chamber.distance_m} m
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                    <span>
                      Type: {report.geo_evidence.closest_chamber.drainage_verified ? 'Verified Stormwater Chamber' : 'Utility Chamber (Drainage Unverified)'}
                    </span>
                    <span>Dataset: {report.geo_evidence.closest_chamber.source_dataset}</span>
                  </div>
                </div>
              )}
            </div>

            {report.geo_evidence && (
              <div className="pt-1.5 border-t border-slate-200/80 space-y-1 text-slate-600">
                <div className="font-semibold text-slate-700 text-[11px]">Field Uncertainty & Drainage Limitations:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
                  {report.geo_evidence.uncertainties?.map((unc, i) => (
                    <li key={i} className="text-amber-800">
                      {unc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Explainable Factor Rationale (Overall Composite) */}
          <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-700" />
                <span>Composite Priority & Action Rationale</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Evidence Confidence: <b>{Math.round(report.confidence_score * 100)}%</b>
              </span>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-slate-800">
              <div className="text-[11px] text-slate-500 font-medium mb-0.5">Recommended Municipal Action:</div>
              <div className="font-medium">{report.recommended_action}</div>
            </div>

            <div className="space-y-1.5">
              {report.risk_factors &&
                report.risk_factors.map((f, i) => (
                  <div key={i} className="p-2 bg-slate-50 rounded border border-slate-200">
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>{f.dimension}</span>
                      <span className="text-red-700 font-mono">+{f.points} pts</span>
                    </div>
                    <p className="text-slate-600 mt-0.5 text-[11px] leading-relaxed">{f.rationale}</p>
                  </div>
                ))}
            </div>
          </div>

          {/* Status Audit Trail */}
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Lifecycle Audit Trail</span>
              </div>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="text-[11px] text-emerald-700 hover:text-emerald-800 font-medium underline"
              >
                {isLoadingHistory ? 'Loading...' : showHistory ? 'Refresh History' : 'View Audit Log'}
              </button>
            </div>

            {showHistory && (
              <div className="space-y-2 pt-1">
                {history.length === 0 ? (
                  <div className="text-[11px] text-slate-400">No previous status transitions recorded.</div>
                ) : (
                  history.map((h) => (
                    <div key={h.id} className="p-2 bg-white rounded border border-slate-200 text-[11px]">
                      <div className="flex justify-between font-semibold text-slate-900">
                        <span>{h.from_status} → {h.to_status}</span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">By: {h.changed_by_name}</div>
                      {h.notes ? <div className="text-slate-600 italic mt-0.5">"{h.notes}"</div> : null}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Municipal Staff Controls (Strictly gated to municipal_admin) */}
          {isMunicipalAdmin ? (
            <>
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold uppercase tracking-wider text-slate-700">
                  Municipal Dispatch & Triage
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400"
                    >
                      <option value="SUBMITTED">SUBMITTED</option>
                      <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                      <option value="ASSIGNED">ASSIGNED</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="VERIFIED">VERIFIED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Assigned Team</label>
                    <input
                      type="text"
                      placeholder="e.g. Ward 9 Rapid Sanitation"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Action Remarks</label>
                  <textarea
                    rows={2}
                    placeholder="Desilting notes, pump deployment logs..."
                    value={authorityNotes}
                    onChange={(e) => setAuthorityNotes(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-slate-400"
                  />
                </div>

                <button
                  onClick={handleUpdateStatus}
                  disabled={isUpdating}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isUpdating ? 'Saving...' : 'Update Status & Log Audit'}</span>
                </button>
              </div>

              {/* Resolution Evidence Upload */}
              <div className="p-3.5 bg-white rounded-lg border border-slate-200 space-y-2.5">
                <h3 className="font-semibold uppercase tracking-wider text-slate-700">
                  Upload Resolution Photograph (After)
                </h3>
                <form onSubmit={handleUploadCleanup} className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setCleanupFile(e.target.files[0]);
                        setCleanupPreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                    className="text-xs text-slate-600"
                  />
                  {cleanupPreview && (
                    <img src={cleanupPreview} alt="Preview" className="h-20 rounded object-cover border border-slate-200" />
                  )}
                  <button
                    type="submit"
                    disabled={!cleanupFile || isUploadingCleanup}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingCleanup ? 'Uploading...' : 'Save Resolution Photo'}</span>
                  </button>
                </form>
              </div>

              {/* Supervisor Sign-off */}
              <div className="p-3.5 bg-emerald-50/50 rounded-lg border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold uppercase tracking-wider text-emerald-900">
                    Supervisor Verification
                  </h3>
                  {report.cleanup_verified ? (
                    <span className="text-[11px] bg-emerald-700 text-white px-2 py-0.5 rounded font-bold">
                      VERIFIED
                    </span>
                  ) : (
                    <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                      AWAITING SIGN-OFF
                    </span>
                  )}
                </div>

                {report.cleanup_verified ? (
                  <div className="text-xs text-slate-700 space-y-1 bg-white p-2.5 rounded border border-emerald-200">
                    <div><b>Verified By:</b> {report.cleanup_verified_by}</div>
                    <div className="font-mono text-[11px] text-slate-500">Timestamp: {report.cleanup_verified_at}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {!report.cleanup_image_path && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                        <span>Resolution photograph (After) must be saved above before verification sign-off is permitted.</span>
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Supervisor Name & Designation"
                      value={verifierName}
                      onChange={(e) => setVerifierName(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-700"
                    />
                    <button
                      onClick={handleVerify}
                      disabled={isVerifying || !report.cleanup_image_path}
                      className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{isVerifying ? 'Signing...' : 'Verify & Close Incident'}</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-xs flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Municipal status dispatch and verification controls are restricted to municipal administrative staff.</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
