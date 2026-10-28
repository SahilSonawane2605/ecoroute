import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Camera,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Info,
  X,
  Compass,
  RotateCw,
  Navigation
} from 'lucide-react';
import { ReportMap } from './ReportMap';
import type { MunicipalAsset } from '../types';
import { formatApiErrorMessage } from '../utils/errorFormatter';

interface SubmitReportModalProps {
  isOpen: boolean;
  token: string | null;
  onClose: () => void;
  onSuccess: () => void;
  assets: MunicipalAsset[];
}

export function SubmitReportModal({ isOpen, token, onClose, onSuccess, assets }: SubmitReportModalProps) {
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState<'plastic_waste' | 'waterlogging'>('plastic_waste');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<any | null>(null);

  // Geolocation & Reverse geocoding states
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'detecting' | 'detected' | 'denied' | 'unavailable' | 'timeout'
  >('idle');
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Reverse geocode lat/lon into readable address using OpenStreetMap Nominatim
  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    setIsReverseGeocoding(true);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'EcoRoutePuneCivicPlatform/2.0'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.display_name) {
          // Format a clean, informative street address
          const addr = data.address || {};
          const road = addr.road || addr.street || addr.pedestrian || addr.suburb || '';
          const neighbourhood = addr.neighbourhood || addr.residential || addr.suburb || '';
          const city = addr.city || addr.town || addr.municipality || 'Pune';
          const postcode = addr.postcode ? ` - ${addr.postcode}` : '';

          let cleanName = '';
          if (road && neighbourhood && road !== neighbourhood) {
            cleanName = `${road}, ${neighbourhood}, ${city}${postcode}`;
          } else if (road || neighbourhood) {
            cleanName = `${road || neighbourhood}, ${city}${postcode}`;
          } else {
            cleanName = data.display_name.split(',').slice(0, 4).join(', ');
          }

          setAddress(cleanName);
        }
      }
    } catch (err) {
      console.warn('Reverse geocoding request could not complete:', err);
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  // Browser Geolocation trigger
  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setLocationErrorMessage('Browser geolocation is not supported on this device.');
      return;
    }

    setIsDetectingLocation(true);
    setLocationStatus('detecting');
    setLocationErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(6));
        const longitude = Number(position.coords.longitude.toFixed(6));
        setLat(latitude);
        setLon(longitude);
        setLocationStatus('detected');
        setIsDetectingLocation(false);
        setLocationErrorMessage(null);

        // Reverse geocode detected coordinates
        reverseGeocode(latitude, longitude);
      },
      (error) => {
        setIsDetectingLocation(false);
        let msg = 'Unable to determine your current position.';
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          msg = 'Location permission was denied. Please allow location access in your browser or click on the map to set coordinates.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationStatus('unavailable');
          msg = 'Location information is currently unavailable from your device network or GPS.';
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus('timeout');
          msg = 'Location request timed out. You can retry or click directly on the map to position your report.';
        }
        setLocationErrorMessage(msg);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, [reverseGeocode]);

  // Requirement 1: Automatically request user location when modal opens
  const hasRequestedLocationOnOpen = useRef(false);

  useEffect(() => {
    if (isOpen) {
      if (!hasRequestedLocationOnOpen.current) {
        hasRequestedLocationOnOpen.current = true;
        requestCurrentLocation();
      }
    } else {
      // Reset state on modal close
      hasRequestedLocationOnOpen.current = false;
      setTitle('');
      setDescription('');
      setAddress('');
      setLat(null);
      setLon(null);
      setSelectedFile(null);
      setPreviewUrl(null);
      setErrorMsg(null);
      setCreatedSummary(null);
      setLocationStatus('idle');
      setLocationErrorMessage(null);
    }
  }, [isOpen, requestCurrentLocation]);

  if (!isOpen) return null;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleLocationSelected = (selectedLat: number, selectedLon: number) => {
    setLat(selectedLat);
    setLon(selectedLon);
    setLocationStatus('detected');
    setLocationErrorMessage(null);
    reverseGeocode(selectedLat, selectedLon);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please upload an incident photograph.');
      return;
    }
    if (!token) {
      setErrorMsg('Authentication required. Please sign in as a citizen or municipal staff to report.');
      return;
    }
    if (lat === null || lon === null) {
      setErrorMsg('Incident coordinates are required. Please allow location detection or click on the map to place a pin.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append(
        'title',
        title.trim() ||
          (reportType === 'plastic_waste' ? 'Plastic Waste Choking Drainage' : 'Active Waterlogging Incident')
      );
      formData.append('report_type', reportType);
      formData.append('description', description.trim());
      formData.append('latitude', lat.toString());
      formData.append('longitude', lon.toString());
      formData.append('address', address.trim() || `${lat.toFixed(6)}, ${lon.toFixed(6)}`);

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        let errBody: any;
        try {
          errBody = await res.json();
        } catch {
          errBody = await res.text();
        }
        throw new Error(formatApiErrorMessage(errBody, `Submission failed with status ${res.status}`));
      }

      const data = await res.json();
      setCreatedSummary(data);
    } catch (err: unknown) {
      setErrorMsg(formatApiErrorMessage(err, 'An error occurred during submission.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Submit Incident Report</h2>
            <p className="text-xs text-slate-500">Citizen Observation & Multi-Factor Drainage Risk Scoring</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdSummary ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hazard Report Submitted</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Incident logged in municipal queue. MobileNetV3 visual classification and hydraulic risk scoring have been computed against genuine coordinates.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-left max-w-md mx-auto space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Report ID:</span>
                <span className="font-mono font-semibold text-slate-900">{createdSummary.report_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Material Classified:</span>
                <span className="font-semibold text-slate-900">{createdSummary.ml_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Saved Coordinates:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {(createdSummary.latitude ?? lat ?? 0).toFixed(6)}, {(createdSummary.longitude ?? lon ?? 0).toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Address Recorded:</span>
                <span className="font-semibold text-slate-900 truncate max-w-[240px] text-right" title={createdSummary.address || address}>
                  {createdSummary.address || address}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assessed Risk Score:</span>
                <span className="font-bold text-red-700">
                  {createdSummary.risk_score} / 100 ({createdSummary.risk_level})
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-slate-700">
                <span className="text-slate-500 block mb-0.5">Recommended Action:</span>
                <span>{createdSummary.recommended_action}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  setCreatedSummary(null);
                  onSuccess();
                  onClose();
                }}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium text-xs transition-colors"
              >
                Return to My Reports
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Type Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Incident Nature
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReportType('plastic_waste')}
                  className={`p-3 text-left rounded-lg border text-xs transition-all ${
                    reportType === 'plastic_waste'
                      ? 'border-emerald-700 bg-emerald-50/50 text-emerald-900 font-semibold ring-1 ring-emerald-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-semibold mb-0.5">Plastic Waste Accumulation</div>
                  <div className="text-[11px] text-slate-500 font-normal">Floating wrappers, bottles, or debris choking roadside conduits.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setReportType('waterlogging')}
                  className={`p-3 text-left rounded-lg border text-xs transition-all ${
                    reportType === 'waterlogging'
                      ? 'border-sky-700 bg-sky-50/50 text-sky-900 font-semibold ring-1 ring-sky-700'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-semibold mb-0.5">Active Waterlogging</div>
                  <div className="text-[11px] text-slate-500 font-normal">Standing water or flooded roadway already disrupting traffic.</div>
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Incident Title
              </label>
              <input
                type="text"
                placeholder="e.g. Grate blocked by plastic sacks outside Paud Road Depot"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Incident Photograph <span className="text-red-600">*</span>
              </label>
              <div className="flex items-center gap-4">
                <label className="flex-1 flex flex-col items-center justify-center p-4 border border-dashed border-slate-300 hover:border-emerald-700 rounded-lg cursor-pointer bg-slate-50 hover:bg-emerald-50/30 transition-colors">
                  <Camera className="w-6 h-6 text-slate-400 mb-1" />
                  <span className="text-xs font-medium text-slate-700">Click to select photograph</span>
                  <span className="text-[11px] text-slate-400 mt-0.5">Analyzed by MobileNetV3 waste classifier</span>
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
                {previewUrl && (
                  <div className="w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            {/* Map Location Picker with Automatic Geolocation Status */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Incident Location</span>
                </label>
                <div className="flex items-center gap-2">
                  {lat !== null && lon !== null ? (
                    <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <Navigation className="w-3 h-3 text-emerald-700" />
                      {lat.toFixed(6)}, {lon.toFixed(6)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      No coordinates set
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={requestCurrentLocation}
                    disabled={isDetectingLocation}
                    className="p-1 rounded text-slate-500 hover:text-emerald-700 hover:bg-slate-100 border border-slate-200 flex items-center gap-1 text-[11px] px-2"
                    title="Retry GPS location detection"
                  >
                    <RotateCw className={`w-3 h-3 ${isDetectingLocation ? 'animate-spin' : ''}`} />
                    <span>{isDetectingLocation ? 'Detecting...' : 'Detect GPS'}</span>
                  </button>
                </div>
              </div>

              {/* Status Notice Banner */}
              {isDetectingLocation && (
                <div className="mb-2 p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-sky-800 text-xs flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-sky-600" />
                  <span>Detecting your current location using device GPS / browser geolocation...</span>
                </div>
              )}

              {locationStatus === 'detected' && (
                <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Location pinned to your position. Click anywhere on the map below if you need to adjust it.</span>
                  </div>
                </div>
              )}

              {locationErrorMessage && (
                <div className="mb-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] space-y-1">
                  <div className="flex items-start gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>{locationErrorMessage}</span>
                  </div>
                  <p className="text-amber-800 text-[10px] pl-5">
                    Fallback: Click directly anywhere on the map below to place the pin at the incident location.
                  </p>
                </div>
              )}

              <div className="h-[200px] border border-slate-200 rounded-lg overflow-hidden relative">
                <ReportMap
                  reports={[]}
                  assets={assets}
                  interactiveSelectLocation={true}
                  onLocationSelected={handleLocationSelected}
                  selectedCoord={lat !== null && lon !== null ? { lat, lon } : null}
                  heightClass="h-full"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tip: You can refine the position by clicking anywhere on the map.
              </p>
            </div>

            {/* Address & Observation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>Street / Landmark Address</span>
                  {isReverseGeocoding && (
                    <span className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Reverse-geocoding...
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="Auto-detected or enter street name..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Field Observations
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Inflow pipe partially submerged"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-700"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Evidence Integrity: Proximity to open rivers or canals does not imply verified drainage discharge. The engine flags missing local stormwater conduits and documents uncertainty.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || lat === null || lon === null}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Running ML & Risk Analysis...</span>
                  </>
                ) : (
                  <span>Submit & Assess Hazard</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
