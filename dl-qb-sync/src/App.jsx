import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from './lib/supabaseClient.js';
import { apiFetch } from './lib/api.js';
import Login from './components/Login.jsx';
import FacturacionInbox from './components/FacturacionInbox.jsx';
import SyncPanel from './components/SyncPanel.jsx';
import DoctoresModule from './components/DoctoresModule.jsx';
import MasterModule from './components/MasterModule.jsx';
import ResidualesModule from './components/ResidualesModule.jsx';
import RelacionadosModule from './components/RelacionadosModule.jsx';
import ExcepcionesModule from './components/ExcepcionesModule.jsx';
import AdjuntosModule from './components/AdjuntosModule.jsx';
import DescuentosModule from './components/DescuentosModule.jsx';
import ComisionesModule from './components/ComisionesModule.jsx';
import MiComisionModule from './components/MiComisionModule.jsx';
import ResumenFacturasModule from './components/ResumenFacturasModule.jsx';
import Sidebar from './components/Sidebar.jsx';

// Correos con acceso completo a la pestana Facturas (crear/editar). Cualquier
// otro usuario ve ahi un resumen de solo lectura en su lugar; el resto de la
// app (Comisiones, Doctores, Master, Residuales) es igual para todos.
const ADMIN_EMAILS = ['contabilidad02@ctauditores.com'];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesion
  const [health, setHealth] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const [modulo, setModulo] = useState('facturas');
  const [miRol, setMiRol] = useState(undefined); // undefined = cargando, { rol, doctor? } una vez sabido

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

  // Un doctor vinculado (Doctores -> Correo de login) solo debe ver "Mi
  // Comision" -- el backend ya filtra los datos, pero ademas restringimos el
  // menu para que no se le muestren pantallas que no le corresponden.
  useEffect(() => {
    if (!session) return;
    if (ADMIN_EMAILS.includes(session.user.email)) {
      setMiRol({ rol: 'admin' });
      return;
    }
    apiFetch('/api/mi-rol')
      .then((res) => res.json())
      .then(setMiRol)
      .catch(() => setMiRol({ rol: 'ninguno' }));
  }, [session]);

  if (session === undefined) return null;
  if (!session) return <Login />;
  if (miRol === undefined) return null;

  const esAdmin = ADMIN_EMAILS.includes(session.user.email);
  const esDoctor = miRol.rol === 'doctor';
  const enFacturas = modulo === 'facturas';

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar
        modulo={esDoctor ? 'mi-comision' : modulo}
        onModuloChange={setModulo}
        health={health}
        email={session.user.email}
        onSync={() => setShowSync(true)}
        onSignOut={() => supabase.auth.signOut()}
        soloMiComision={esDoctor}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className={enFacturas && esAdmin && !esDoctor ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          <div className="mx-auto h-full max-w-[1600px] px-6 py-6">
            {esDoctor ? (
              <MiComisionModule doctor={miRol.doctor} />
            ) : (
              <>
                {modulo === 'facturas' && (esAdmin ? <FacturacionInbox /> : <ResumenFacturasModule />)}
                {modulo === 'comisiones' && <ComisionesModule />}
                {modulo === 'doctores' && <DoctoresModule />}
                {modulo === 'master' && <MasterModule />}
                {modulo === 'residuales' && <ResidualesModule />}
                {modulo === 'relacionados' && <RelacionadosModule />}
                {modulo === 'excepciones' && <ExcepcionesModule />}
                {modulo === 'adjuntos' && <AdjuntosModule />}
                {modulo === 'descuentos' && <DescuentosModule />}
              </>
            )}
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
