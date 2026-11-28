import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function RequireAdmin({ children }) {
  const profile = useStore((s) => s.profile);
  const dataLoading = useStore((s) => s.dataLoading);
  const dataError = useStore((s) => s.dataError);

  // While the initial profile fetch is in flight, render a loading placeholder.
  // Never redirect during loading — redirect only after loading finishes.
  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" data-testid="admin-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-slate-400" />
          <p className="text-sm text-slate-400">Loading admin access…</p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background" data-testid="admin-error">
        <div className="glass-strong rounded-3xl p-8 max-w-sm text-center shadow-glass">
          <h1 className="text-lg font-semibold text-slate-50 mb-1">Couldn&apos;t load admin access</h1>
          <p className="text-sm text-slate-400 mb-6">{dataError}</p>
        </div>
      </div>
    );
  }

  return profile?.isAdmin ? children : <Navigate to="/dashboard" replace />;
}
