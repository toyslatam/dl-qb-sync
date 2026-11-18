import { useState } from 'react';
import {
  FileText,
  Calculator,
  Stethoscope,
  Settings,
  ChevronDown,
  Landmark,
  HeartPulse,
  RefreshCcw,
  LogOut,
  Link2,
  ShieldOff,
  Paperclip,
  Percent,
} from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV = [
  { key: 'facturas', label: 'Facturas', icon: FileText },
  { key: 'comisiones', label: 'Comisiones', icon: Calculator },
  { key: 'doctores', label: 'Doctores', icon: Stethoscope },
  { key: 'adjuntos', label: 'Adjuntos', icon: Paperclip },
];

const CONFIG_SUBNAV = [
  { key: 'master', label: 'Master', icon: Landmark },
  { key: 'residuales', label: 'Residuales', icon: HeartPulse },
  { key: 'excepciones', label: 'Excepciones', icon: ShieldOff },
  { key: 'relacionados', label: 'Relacionados', icon: Link2 },
  { key: 'descuentos', label: 'Descuentos', icon: Percent },
];

function NavButton({ item, active, onClick, indent }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        indent && 'pl-10',
        active ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      )}
    >
      <Icon size={18} className={cn('shrink-0', active ? 'text-primary' : 'text-slate-500')} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

// Un doctor con acceso restringido a "Mi Comision" no debe ver el resto del
// menu (Facturas, Comisiones completas, Doctores, Configuracion) -- ni
// siquiera como enlace, para que quede claro que esta cuenta solo ve lo suyo.
const NAV_DOCTOR = [{ key: 'mi-comision', label: 'Mi Comisión', icon: Calculator }];

export default function Sidebar({ modulo, onModuloChange, health, email, onSync, onSignOut, soloMiComision }) {
  const [configAbierta, setConfigAbierta] = useState(CONFIG_SUBNAV.some((s) => s.key === modulo));

  const nav = soloMiComision ? NAV_DOCTOR : NAV;

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 pb-4 pt-5">
        {/* El jpg del logo es cuadrado con mucho aire: se recorta a la franja del wordmark. */}
        <div className="h-14 overflow-hidden">
          <img src="/dental-one-logo.jpg" alt="Dental One" className="h-full w-full object-cover object-center" />
        </div>
        <h1 className="mt-1 text-[0.875rem] font-semibold text-slate-500">Dental Quick</h1>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4">
        {nav.map((item) => (
          <NavButton key={item.key} item={item} active={modulo === item.key} onClick={() => onModuloChange(item.key)} />
        ))}

        {!soloMiComision && (
          <div>
            <button
              onClick={() => setConfigAbierta((v) => !v)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              <Settings size={18} className="shrink-0 text-slate-500" />
              <span className="flex-1 truncate">Configuración</span>
              <ChevronDown size={14} className={cn('shrink-0 transition-transform', configAbierta && 'rotate-180')} />
            </button>
            {configAbierta && (
              <div className="mt-1 space-y-1">
                {CONFIG_SUBNAV.map((item) => (
                  <NavButton key={item.key} item={item} active={modulo === item.key} onClick={() => onModuloChange(item.key)} indent />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="space-y-3 border-t border-slate-200 px-4 py-4">
        {health && !soloMiComision && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold',
              health.ok ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
            )}
          >
            {health.ok ? 'API conectada' : 'Sin conexión'}
          </span>
        )}

        {!soloMiComision && (
          <button
            onClick={onSync}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <RefreshCcw size={18} className="shrink-0 text-slate-500" />
            Sincronizar
          </button>
        )}

        <div className="border-t border-slate-200 pt-3">
          <p className="truncate px-3 text-[0.875rem] text-slate-500">{email}</p>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium text-slate-600 hover:bg-danger-light hover:text-danger"
          >
            <LogOut size={18} className="shrink-0" />
            Salir
          </button>
        </div>
      </div>
    </aside>
  );
}
