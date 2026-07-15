import { CheckCircle2, Clock, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../lib/utils.js';

export const ESTADOS = {
  pendiente: { label: 'Pendiente', icon: Clock, className: 'bg-slate-100 text-slate-600' },
  en_cola: { label: 'En revisión', icon: AlertTriangle, className: 'bg-warning-light text-warning' },
  sincronizado: { label: 'Procesado', icon: CheckCircle2, className: 'bg-success-light text-success' },
  error: { label: 'Error', icon: XCircle, className: 'bg-danger-light text-danger' },
};

export default function StatusBadge({ estado, className }) {
  const info = ESTADOS[estado] ?? ESTADOS.pendiente;
  const Icon = info.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold whitespace-nowrap',
        info.className,
        className
      )}
    >
      <Icon size={12} strokeWidth={2.5} />
      {info.label}
    </span>
  );
}
