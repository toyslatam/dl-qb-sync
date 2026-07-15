import { useEffect, useState } from 'react';
import { RefreshCcw, LogOut, X } from 'lucide-react';
import { supabase } from './lib/supabaseClient.js';
import { apiFetch } from './lib/api.js';
import Login from './components/Login.jsx';
import FacturacionInbox from './components/FacturacionInbox.jsx';
import SyncPanel from './components/SyncPanel.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const [health, setHealth] = useState(null);
  const [showSync, setShowSync] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    apiFetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
  }, [session]);

  if (session === undefined) return null;
  if (!session) return <Login />;

  return (
    <div className="min-h-screen bg-bg px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Dentalink → QuickBooks</h1>
          {health && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold ${
                health.ok ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
              }`}
            >
              {health.ok ? 'API conectada' : 'Sin conexión'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <button
            onClick={() => setShowSync(true)}
            title="Sincronización manual por rango de fechas"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-slate-600 hover:border-primary hover:text-primary"
          >
            <RefreshCcw size={14} />
            Sincronizar por rango
          </button>
          <span className="hidden sm:inline">{session.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-slate-600 hover:border-danger hover:text-danger"
          >
            <LogOut size={14} />
            Salir
          </button>
        </div>
      </header>

      <FacturacionInbox />

      {showSync && (
        <div className="fixed inset-0 z-30 flex items-start justify-center bg-slate-900/40 p-6" onClick={() => setShowSync(false)}>
          <div className="mt-10 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-end">
              <button onClick={() => setShowSync(false)} className="rounded-full bg-white p-1.5 text-slate-500 shadow-card hover:text-slate-800">
                <X size={16} />
              </button>
            </div>
            <SyncPanel onSynced={() => setShowSync(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
