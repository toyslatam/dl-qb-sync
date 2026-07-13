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
    <div style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Dentalink → QuickBooks</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Email
            <br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Contraseña
            <br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '1rem' }}>
        Tu cuenta la crea el administrador desde el panel de Supabase (Authentication → Users).
      </p>
    </div>
  );
}
