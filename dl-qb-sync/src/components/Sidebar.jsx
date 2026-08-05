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
} from 'lucide-react';
import { cn } from '../lib/utils.js';

const NAV = [
  { key: 'facturas', label: 'Facturas', icon: FileText },
  { key: 'comisiones', label: 'Comisiones', icon: Calculator },
  { key: 'doctores', label: 'Doctores', icon: Stethoscope },
];

const CONFIG_SUBNAV = [
  { key: 'master', label: 'Master', icon: Landmark },
  { key: 'residuales', label: 'Residuales', icon: HeartPulse },
  { key: 'relacionados', label: 'Relacionados', icon: Link2 },
];

function NavButton({ item, active, onClick, indent }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
        indent && 'pl-9',
        active ? 'bg-primary-light text-primary' : 'text-slate-600 hover:bg-slate-100'
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ modulo, onModuloChange, health, email, onSync, onSignOut }) {
  const [configAbierta, setConfigAbierta] = useState(CONFIG_SUBNAV.some((s) => s.key === modulo));

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-4 py-5">
        <h1 className="text-lg font-extrabold leading-tight tracking-tight text-slate-900">Dental Quick</h1>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((item) => (
          <NavButton key={item.key} item={item} active={modulo === item.key} onClick={() => onModuloChange(item.key)} />
        ))}

        <div>
          <button
            onClick={() => setConfigAbierta((v) => !v)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Settings size={16} className="shrink-0" />
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
      </nav>

      <div className="space-y-3 border-t border-slate-100 px-3 py-4">
        {health && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold',
              health.ok ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
            )}
          >
            {health.ok ? 'API conectada' : 'Sin conexión'}
          </span>
        )}

        <button
          onClick={onSync}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <RefreshCcw size={15} className="shrink-0" />
          Sincronizar
        </button>

        <div className="border-t border-slate-100 pt-3">
          <p className="truncate px-3 text-[0.78rem] text-slate-400">{email}</p>
          <button
            onClick={onSignOut}
            className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-danger-light hover:text-danger"
          >
            <LogOut size={15} className="shrink-0" />
            Salir
          </button>
        </div>
      </div>
    </aside>
  );
}
