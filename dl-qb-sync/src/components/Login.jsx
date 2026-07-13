import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="login-shell">
      <h1>Dentalink → QuickBooks</h1>
      <form onSubmit={handleSubmit} className="stack">
        <label className="field-label">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field-label">
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="text-danger">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
        Tu cuenta la crea el administrador desde el panel de Supabase (Authentication → Users).
      </p>
    </div>
  );
}
