import { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { apiFetch } from './lib/api.js';
import Login from './components/Login.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import ReviewQueue from './components/ReviewQueue.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const [health, setHealth] = useState(null);

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
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dentalink → QuickBooks</h1>
        <div>
          <span style={{ marginRight: '0.75rem', color: '#666' }}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </div>
      <p>API: {health === null ? 'verificando…' : health.ok ? '✅ conectada' : '❌ sin conexion'}</p>
      <SyncPanel />
      <ReviewQueue />
    </div>
  );
}
