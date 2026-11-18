import { motion } from 'framer-motion';
import { CreditCard } from 'lucide-react';
import { cn } from '../lib/utils.js';
import StatusBadge from './StatusBadge.jsx';

export default function PaymentCard({ pago, selected, onClick }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'w-full rounded-2xl border px-4 py-3 text-left transition-all duration-150',
        selected
          ? 'border-primary bg-primary-light'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">
            {pago.nombrePaciente || `Paciente #${pago.idPaciente}`}
          </p>
          <p className="mt-0.5 text-[0.875rem] text-slate-500">
            Pago #{pago.id}
            {pago.folio ? ` · Boleta ${pago.folio}` : ''}
          </p>
        </div>
        <StatusBadge estado={pago.estado} />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight tabular-nums text-slate-900">
          ${Number(pago.monto ?? 0).toLocaleString('es-PA', { minimumFractionDigits: 2 })}
        </span>
        <span className="flex items-center gap-1 text-[0.8125rem] text-slate-500">
          <CreditCard size={14} />
          {pago.medioPago || '—'}
        </span>
      </div>
    </motion.button>
  );
}
