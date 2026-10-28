import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Filter,
  Search,
  ArrowUpDown,
  MapPin,
  RefreshCw,
  Layers
} from 'lucide-react';
import type { ReportItem } from '../types';

interface MunicipalPriorityQueueProps {
  reports: ReportItem[];
  selectedReport: ReportItem | null;
  onSelectReport: (report: ReportItem) => void;
  isLoading: boolean;
  onRefresh: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedRisk: string;
  onRiskChange: (risk: string) => void;
  selectedType: string;
  onTypeChange: (type: string) => void;
  sortBy: 'risk_score' | 'created_at' | 'status';
  onSortByChange: (sort: 'risk_score' | 'created_at' | 'status') => void;
}

export function MunicipalPriorityQueue({
  reports,
  selectedReport,
  onSelectReport,
  isLoading,
  onRefresh,
  searchQuery,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  selectedRisk,
  onRiskChange,
  selectedType,
  onTypeChange,
  sortBy,
  onSortByChange
}: MunicipalPriorityQueueProps) {
  // Compute operational overview metrics from real data
  const totalReports = reports.length;
  const criticalCount = reports.filter(r => r.risk_score >= 75).length;
  const highCount = reports.filter(r => r.risk_score >= 50 && r.risk_score < 75).length;
  const underReviewCount = reports.filter(r => r.status === 'UNDER_REVIEW' || r.status === 'SUBMITTED').length;
  const inProgressCount = reports.filter(r => r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS').length;
  const verifiedCount = reports.filter(r => r.status === 'VERIFIED' || r.status === 'RESOLVED').length;

  return (
    <div className="space-y-4">
      {/* 1. Operational Overview Metrics (Real database records) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total In Queue</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900">{totalReports}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Assigned ward incidents</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-red-200/80 shadow-xs">
          <div className="flex items-center justify-between text-red-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">High / Critical</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-red-700">{criticalCount + highCount}</div>
          <div className="text-[10px] text-red-600/80 mt-0.5">{criticalCount} Critical • {highCount} High</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Under Review</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-800">{underReviewCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Awaiting staff review</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-blue-200/80 shadow-xs">
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">In Progress</span>
            <AlertTriangle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-blue-800">{inProgressCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Field crew dispatched</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-emerald-200/80 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">Verified Closed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-800">{verifiedCount}</div>
          <div className="text-[10px] text-emerald-700 mt-0.5">Photo-verified resolved</div>
        </div>
      </div>

      {/* 2. Prominent Filter & Sort Toolbar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by ID, location, or material..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg w-60 text-xs bg-slate-50/50 focus:bg-white focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Statuses</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="VERIFIED">VERIFIED & CLOSED</option>
          </select>

          {/* Risk Tier Filter */}
          <select
            value={selectedRisk}
            onChange={(e) => onRiskChange(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Risk Tiers</option>
            <option value="CRITICAL">CRITICAL (75-100)</option>
            <option value="HIGH">HIGH (50-74)</option>
            <option value="MODERATE">MODERATE (25-49)</option>
            <option value="LOW">LOW (&lt; 25)</option>
          </select>

          {/* Hazard Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">All Incident Types</option>
            <option value="plastic_waste">Plastic Ingress Hazards</option>
            <option value="waterlogging">Active Waterlogging</option>
          </select>

          {/* Sorting */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
            >
              <option value="risk_score">Highest Priority First</option>
              <option value="created_at">Most Recent</option>
              <option value="status">Status Progression</option>
            </select>
          </div>
        </div>

        {/* Refresh & Reset Controls */}
        <div className="flex items-center gap-2">
          {(searchQuery || selectedStatus !== 'all' || selectedRisk !== 'all' || selectedType !== 'all') && (
            <button
              onClick={() => {
                onSearchChange('');
                onStatusChange('all');
                onRiskChange('all');
                onTypeChange('all');
              }}
              className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 3. The Prominent Priority Queue Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/90 bg-slate-50/70 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              <span>Municipal Action Priority Queue</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-200/80 font-mono text-[11px] text-slate-700 font-semibold">
                {reports.length}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ranked by composite drainage obstruction & waterlogging hazard index. Click any row to inspect GIS evidence and dispatch crews.
            </p>
          </div>
        </div>

        {/* Priority Queue Rows */}
        {reports.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-xs">No Matching Incidents in Queue</div>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                No reports match your active filter criteria or ward assignment. Reset filters to view all logged incidents.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-4 w-28">Priority / Score</th>
                  <th className="py-2.5 px-4 w-28">Incident ID</th>
                  <th className="py-2.5 px-4">Hazard & Location</th>
                  <th className="py-2.5 px-4 w-36">Nearby Drainage</th>
                  <th className="py-2.5 px-4 w-32">Status</th>
                  <th className="py-2.5 px-4 w-32">Assigned Officer</th>
                  <th className="py-2.5 px-4 w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {reports.map((rep) => {
                  const isCritical = rep.risk_score >= 75;
                  const isHigh = rep.risk_score >= 50 && rep.risk_score < 75;
                  const isModerate = rep.risk_score >= 25 && rep.risk_score < 50;

                  const riskBadge = isCritical
                    ? 'bg-red-50 text-red-700 border-red-200/80 font-bold'
                    : isHigh
                    ? 'bg-orange-50 text-orange-700 border-orange-200/80 font-bold'
                    : isModerate
                    ? 'bg-amber-50 text-amber-700 border-amber-200/80 font-semibold'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-semibold';

                  const isSelected = selectedReport?.id === rep.id;

                  return (
                    <tr
                      key={rep.id}
                      onClick={() => onSelectReport(rep)}
                      className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      {/* Priority Score Badge */}
                      <td className="py-3 px-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border ${riskBadge}`}>
                          <span className="font-mono font-bold text-xs">{rep.risk_score}</span>
                          <span className="text-[10px] uppercase tracking-wider">/ 100</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-0.5 capitalize">
                          {rep.risk_level.toLowerCase()} priority
                        </div>
                      </td>

                      {/* ID & Age */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-bold text-slate-900 block">{rep.id}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {new Date(rep.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </td>

                      {/* Hazard & Location */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={rep.image_path}
                            alt="Incident"
                            className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 text-xs truncate max-w-xs">{rep.title}</div>
                            <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{rep.address}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                              <span>Class: <b className="text-slate-700">{rep.ml_category}</b> ({Math.round(rep.ml_confidence * 100)}%)</span>
                              <span className="text-slate-300">•</span>
                              <span>Extent: ~{rep.ml_extent_coverage}%</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Nearby Drainage Proximity */}
                      <td className="py-3 px-4">
                        {rep.drain_distance_m !== null && rep.drain_distance_m !== undefined ? (
                          <div>
                            <span className="font-semibold text-slate-800 text-[11px] block">
                              {rep.drain_distance_m} m
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block max-w-xs">
                              {rep.geo_evidence?.closest_drain?.name || 'Drainage Channel'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">No drain &lt; 2km</span>
                        )}
                        {rep.waterway_distance_m !== null && rep.waterway_distance_m !== undefined && (
                          <span className="text-[10px] text-sky-700 block mt-0.5 font-medium">
                            River: {rep.waterway_distance_m} m
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rep.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : rep.status === 'RESOLVED'
                            ? 'bg-blue-50 text-blue-800 border-blue-200'
                            : rep.status === 'IN_PROGRESS'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {rep.status === 'VERIFIED' ? '✓ VERIFIED' : rep.status}
                        </span>
                      </td>

                      {/* Assigned Officer */}
                      <td className="py-3 px-4">
                        <span className="text-slate-700 text-[11px] font-medium block truncate max-w-xs">
                          {rep.assigned_to || <span className="text-slate-400 italic">Unassigned</span>}
                        </span>
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReport(rep);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-700 font-semibold rounded-md text-[11px] transition-colors"
                          title="View Details"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
