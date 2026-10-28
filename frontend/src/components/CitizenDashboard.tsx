import {
  FileText,
  Clock,
  CheckCircle2,
  Plus,
  MapPin,
  ShieldAlert,
  ArrowRight,
  Info,
  Sparkles
} from 'lucide-react';
import type { ReportItem } from '../types';

interface CitizenDashboardProps {
  reports: ReportItem[];
  userName: string;
  onOpenReportModal: () => void;
  onSelectReport: (report: ReportItem) => void;
  onViewMap: () => void;
}

export function CitizenDashboard({
  reports,
  userName,
  onOpenReportModal,
  onSelectReport,
  onViewMap
}: CitizenDashboardProps) {
  // Real database metrics computed from citizen's reports
  const totalReports = reports.length;
  const activeReports = reports.filter(r => r.status !== 'VERIFIED' && r.status !== 'RESOLVED' && r.status !== 'REJECTED').length;
  const resolvedCount = reports.filter(r => r.status === 'VERIFIED' || r.status === 'RESOLVED').length;
  const attentionCount = reports.filter(r => r.risk_score >= 50 && (r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW')).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Personalized Welcome Header & Primary Action */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-semibold tracking-wider uppercase">
              Pune Citizen Environmental Portal
            </span>
            <span className="text-emerald-300 text-xs">• Ward 9 Community Network</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Welcome back, {userName}
          </h1>
          <p className="text-xs text-emerald-100/90 leading-relaxed">
            Report roadside plastic debris or storm drain blockages directly to Pune Municipal Corporation. Your submissions guide desilting crews before monsoon flooding occurs.
          </p>
        </div>

        <button
          onClick={onOpenReportModal}
          className="px-5 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 shrink-0 active:scale-98"
        >
          <Plus className="w-4 h-4 text-emerald-700" />
          <span>Report an Environmental Hazard</span>
        </button>
      </div>

      {/* 2. Real Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">My Reports</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{totalReports}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Total incidents submitted</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Open Incidents</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-800">{activeReports}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Under municipal review or action</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Resolved & Verified</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-800">{resolvedCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Closed with field photo proof</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700">High Risk Priority</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-700">{attentionCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Conduit obstruction flagged</div>
        </div>
      </div>

      {/* 3. Main Split Section: Recent Reports & Reporting Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Recent Submissions with status trail */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Recent Incident Submissions ({reports.length})
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Track status changes, desilting assignments, and photographic closure evidence in real time.
              </p>
            </div>
            {reports.length > 0 && (
              <button
                onClick={onViewMap}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold flex items-center gap-1 transition-colors"
              >
                <span>View on Map</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">No Incident Reports Logged Yet</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Help prevent urban waterlogging in your neighbourhood. Photograph plastic debris near gutters or street drains to alert municipal authorities.
                  </p>
                </div>
                <button
                  onClick={onOpenReportModal}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-medium rounded-lg text-xs shadow-xs transition-colors"
                >
                  Submit Your First Report
                </button>
              </div>
            ) : (
              reports.map((rep) => {
                const isCritical = rep.risk_score >= 75;
                const isHigh = rep.risk_score >= 50 && rep.risk_score < 75;
                const isModerate = rep.risk_score >= 25 && rep.risk_score < 50;

                const riskBadge = isCritical
                  ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                  : isHigh
                  ? 'bg-orange-50 text-orange-700 border-orange-200 font-bold'
                  : isModerate
                  ? 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold';

                return (
                  <div
                    key={rep.id}
                    onClick={() => onSelectReport(rep)}
                    className="p-4 hover:bg-slate-50/90 transition-colors cursor-pointer flex items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <img
                        src={rep.image_path}
                        alt="Incident thumbnail"
                        className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs font-bold text-slate-900">{rep.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${riskBadge}`}>
                            Risk: {rep.risk_score}/100
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            rep.status === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : rep.status === 'RESOLVED'
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : rep.status === 'IN_PROGRESS'
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {rep.status === 'VERIFIED' ? '✓ VERIFIED & CLOSED' : rep.status}
                          </span>
                        </div>

                        <h4 className="font-semibold text-slate-900 text-xs truncate max-w-md">{rep.title}</h4>
                        <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{rep.address}</span>
                          <span className="text-slate-300">•</span>
                          <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectReport(rep);
                        }}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-md text-xs flex items-center gap-1 transition-colors"
                      >
                        <span>View Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 1 Col: Citizen Guidelines & Impact Card */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <Info className="w-4 h-4 text-emerald-700" />
              <span>What Makes an Effective Report?</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-2.5 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                  1
                </span>
                <span><b>Clear Street Grate View:</b> Photograph the debris in relation to the road gutter or drain inlet.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                  2
                </span>
                <span><b>Exact Geolocation:</b> Allow GPS access so municipal desilting vehicles locate the exact stormwater manhole.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-800 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                  3
                </span>
                <span><b>Track Photo Verification:</b> Municipal staff must upload photo evidence before closing an incident.</span>
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-xl border border-emerald-200/80 p-5 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <span>AI & GIS Verification Process</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Every citizen photo is scanned using MobileNetV3 on the RealWaste dataset and checked against Pune Municipal Corporation GIS stormwater line channels and water bodies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
