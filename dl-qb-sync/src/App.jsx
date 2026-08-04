import { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { supabase } from './lib/supabaseClient.js';
import { apiFetch } from './lib/api.js';
import Login from './components/Login.jsx';
import FacturacionInbox from './components/FacturacionInbox.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import DoctoresModule from './components/DoctoresModule.jsx';
import MasterModule from './components/MasterModule.jsx';
import ResidualesModule from './components/ResidualesModule.jsx';
import ComisionesModule from './components/ComisionesModule.jsx';
import ResumenFacturasModule from './components/ResumenFacturasModule.jsx';
import Sidebar from './components/Sidebar.jsx';

// Correos con acceso completo (facturacion + comisiones + doctores + master +
// residuales). Cualquier otro usuario que inicie sesion solo ve el resumen de
// estados de facturacion, de solo lectura.
const ADMIN_EMAILS = ['contabilidad02@ctauditores.com'];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const [health, setHealth] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const [modulo, setModulo] = useState('facturas');

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

  const esAdmin = ADMIN_EMAILS.includes(session.user.email);

  if (!esAdmin) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-bg">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <img src="/dental-one-logo.jpg" alt="Dental One" className="h-16 w-auto object-contain" />
          <div className="flex items-center gap-3">
            <span className="text-[0.82rem] text-slate-500">{session.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-slate-600 hover:border-danger hover:text-danger"
            >
              <LogOut size={14} />
              Salir
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto h-full max-w-[1600px] px-6 py-6">
            <ResumenFacturasModule />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar
        modulo={modulo}
        onModuloChange={setModulo}
        health={health}
        email={session.user.email}
        onSync={() => setShowSync(true)}
        onSignOut={() => supabase.auth.signOut()}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className={modulo === 'facturas' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          <div className="mx-auto h-full max-w-[1600px] px-6 py-6">
            {modulo === 'facturas' && <FacturacionInbox />}
            {modulo === 'comisiones' && <ComisionesModule />}
            {modulo === 'doctores' && <DoctoresModule />}
            {modulo === 'master' && <MasterModule />}
            {modulo === 'residuales' && <ResidualesModule />}
          </div>
        </main>
      </div>

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
