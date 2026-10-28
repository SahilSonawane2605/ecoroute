import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Lock,
  Mail,
  AlertCircle,
  Loader2,
  KeyRound,
  ShieldAlert,
  UserCheck
} from 'lucide-react';
import type { User } from '../types';
import { formatApiErrorMessage } from '../utils/errorFormatter';

interface DemoCredentialInfo {
  email: string;
  password?: string;
  role: 'citizen' | 'municipal_admin';
  description: string;
}

interface DemoConfig {
  enabled: boolean;
  citizen?: DemoCredentialInfo;
  municipal?: DemoCredentialInfo;
}

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'citizen_login' | 'admin_login';
  onClose: () => void;
  onSuccess: (token: string, user: User) => void;
}

export function AuthModal({ isOpen, initialMode, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'citizen_login' | 'admin_login'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [demoConfig, setDemoConfig] = useState<DemoConfig | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setErrorMsg(null);
    setFieldErrors({});
  }, [initialMode, isOpen]);

  // Fetch demo credentials if enabled in development
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    fetch('/api/auth/demo-credentials')
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: DemoConfig) => {
        if (isMounted) {
          setDemoConfig(data);
        }
      })
      .catch(() => {
        if (isMounted) setDemoConfig({ enabled: false });
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyDemo = (demo: DemoCredentialInfo) => {
    setEmail(demo.email);
    if (demo.password) {
      setPassword(demo.password);
    }
    setErrorMsg(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});

    // Client validation
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!email.includes('@') || !email.includes('.')) {
      errors.email = 'Please provide a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        let errBody: any;
        try {
          errBody = await res.json();
        } catch {
          errBody = await res.text();
        }
        const humanReadable = formatApiErrorMessage(errBody, `Authentication failed with status ${res.status}`);
        throw new Error(humanReadable);
      }

      const data = await res.json();
      if (mode === 'admin_login' && data.user.role !== 'municipal_admin') {
        throw new Error('Access Denied: This account lacks municipal administrative privileges.');
      }

      onSuccess(data.access_token, data.user);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(formatApiErrorMessage(err, 'Authentication error. Please check your network and credentials.'));
    } finally {
      setIsLoading(false);
    }
  };

  const isMunicipalMode = mode === 'admin_login';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
        {/* Header Tabs: Two Clear Account Options */}
        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setMode('citizen_login');
              setErrorMsg(null);
              setFieldErrors({});
            }}
            className={`py-3.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              !isMunicipalMode
                ? 'border-emerald-700 text-emerald-900 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4 text-emerald-700" />
            <span>Citizen Login</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('admin_login');
              setErrorMsg(null);
              setFieldErrors({});
            }}
            className={`py-3.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-colors ${
              isMunicipalMode
                ? 'border-slate-900 text-slate-900 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-slate-800" />
            <span>Municipal Staff Login</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {isMunicipalMode ? 'Municipal Administration Portal' : 'Citizen Incident Portal'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isMunicipalMode
                ? 'Sign in to access municipal desilting triage, report assignments, and resolution audits.'
                : 'Sign in to submit drainage blockage hazards, upload photos, and track resolution status.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder={isMunicipalMode ? 'e.g. municipal.demo@ecoroute.local' : 'e.g. citizen.demo@ecoroute.local'}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: undefined }));
                  }}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs focus:outline-none ${
                    fieldErrors.email
                      ? 'border-red-400 bg-red-50/50'
                      : isMunicipalMode
                      ? 'border-slate-200 focus:border-slate-900'
                      : 'border-slate-200 focus:border-emerald-700'
                  }`}
                />
              </div>
              {fieldErrors.email && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
                  }}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs focus:outline-none ${
                    fieldErrors.password
                      ? 'border-red-400 bg-red-50/50'
                      : isMunicipalMode
                      ? 'border-slate-200 focus:border-slate-900'
                      : 'border-slate-200 focus:border-emerald-700'
                  }`}
                />
              </div>
              {fieldErrors.password && (
                <p className="text-[11px] text-red-600 mt-1">{fieldErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-2.5 rounded-lg text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors ${
                isMunicipalMode
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>{isMunicipalMode ? 'Access Municipal Console' : 'Sign In as Citizen'}</span>
              )}
            </button>
          </form>

          {/* Clearly Labeled Demo Credentials Section */}
          {demoConfig?.enabled && (
            <div className="mt-4 pt-3.5 border-t border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-slate-700">
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Demo Credentials (Development Mode)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Click an account below to prefill verified demo credentials:
              </p>

              <div className="grid grid-cols-1 gap-2">
                {demoConfig.citizen && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('citizen_login');
                      handleApplyDemo(demoConfig.citizen!);
                    }}
                    className={`p-2 rounded-lg border text-left flex items-start justify-between transition-colors ${
                      !isMunicipalMode
                        ? 'border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-emerald-900 text-xs flex items-center gap-1.5">
                        <span>Citizen Demo</span>
                        <span className="text-[10px] font-normal text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">Role: Citizen</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 mt-0.5">{demoConfig.citizen.email}</div>
                      <div className="text-[10px] text-slate-400">{demoConfig.citizen.description}</div>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-medium">Use Account →</span>
                  </button>
                )}

                {demoConfig.municipal && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('admin_login');
                      handleApplyDemo(demoConfig.municipal!);
                    }}
                    className={`p-2 rounded-lg border text-left flex items-start justify-between transition-colors ${
                      isMunicipalMode
                        ? 'border-slate-400 bg-slate-100/70 hover:bg-slate-100'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                        <span>Municipal Demo</span>
                        <span className="text-[10px] font-normal text-slate-700 bg-slate-200 px-1.5 py-0.2 rounded">Role: Municipal Admin</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 mt-0.5">{demoConfig.municipal.email}</div>
                      <div className="text-[10px] text-slate-400">{demoConfig.municipal.description}</div>
                    </div>
                    <span className="text-[11px] text-slate-700 font-medium">Use Account →</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Dismiss button */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Cancel and Return
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
