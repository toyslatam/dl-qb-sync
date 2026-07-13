import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { apiFetch } from './lib/api.js';
import Login from './components/Login.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import ReviewQueue from './components/ReviewQueue.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const [health, setHealth] = useState(null);
  const [reviewQueueVersion, setReviewQueueVersion] = useState(0);

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
    <div className="app-shell">
      <div className="app-header">
        <h1>Dentalink → QuickBooks</h1>
        <div className="user-chip">
          <span>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
      <p>
        API:{' '}
        {health === null ? (
          'verificando…'
        ) : health.ok ? (
          <span className="badge badge-success">conectada</span>
        ) : (
          <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
            sin conexión
          </span>
        )}
      </p>
      <SyncPanel onSynced={() => setReviewQueueVersion((v) => v + 1)} />
      <ReviewQueue refreshTrigger={reviewQueueVersion} />
    </div>
  );
}
