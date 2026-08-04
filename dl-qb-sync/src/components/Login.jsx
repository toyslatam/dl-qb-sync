import { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient.js';

const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-card border border-slate-200 bg-white p-8 shadow-card">
        <div className="-mb-2 -mt-4 flex justify-center">
          <img src="/dental-one-logo.jpg" alt="Dental One" className="h-32 w-auto object-contain" />
        </div>

        <h1 className="mb-6 text-center text-base font-bold tracking-tight text-slate-900">Dentalink → QuickBooks</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClass}
            />
          </label>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center gap-2 text-[0.72rem] text-slate-400">
        <span>Hecho por</span>
        <img src="/ct-auditores-logo.jpg" alt="CT Auditores" className="h-5 w-auto object-contain opacity-80" />
      </div>
    </div>
  );
}
