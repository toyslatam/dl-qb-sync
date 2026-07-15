import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils.js';
import StatisticCard from './StatisticCard.jsx';
import PaymentCard from './PaymentCard.jsx';

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'en_cola', label: 'En revisión' },
  { key: 'sincronizado', label: 'Procesados' },
  { key: 'error', label: 'Error' },
];

export default function PaymentsSidebar({
  fecha,
  onFechaChange,
  pagos,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  errores,
}) {
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const pagosConEstado = useMemo(
    () => pagos.map((p) => ({ ...p, estado: errores[p.id] ? 'error' : p.estado })),
    [pagos, errores]
  );

  const stats = useMemo(
    () => ({
      pendiente: pagosConEstado.filter((p) => p.estado === 'pendiente').length,
      en_cola: pagosConEstado.filter((p) => p.estado === 'en_cola').length,
      sincronizado: pagosConEstado.filter((p) => p.estado === 'sincronizado').length,
      error: pagosConEstado.filter((p) => p.estado === 'error').length,
    }),
    [pagosConEstado]
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pagosConEstado.filter((p) => {
      if (filtro !== 'todos' && p.estado !== filtro) return false;
      if (!q) return true;
      return (
        String(p.id).includes(q) ||
        String(p.idPaciente).includes(q) ||
        (p.folio && String(p.folio).toLowerCase().includes(q)) ||
        (p.nombrePaciente && p.nombrePaciente.toLowerCase().includes(q))
      );
    });
  }, [pagosConEstado, query, filtro]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={fecha}
          onChange={(e) => onFechaChange(e.target.value)}
          className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Actualizar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <RefreshCw size={15} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatisticCard label="Pendientes" value={stats.pendiente} tone="slate" />
        <StatisticCard label="En revisión" value={stats.en_cola} tone="warning" />
        <StatisticCard label="Procesados" value={stats.sincronizado} tone="success" />
        <StatisticCard label="Error" value={stats.error} tone="danger" />
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, pago, factura o cliente…"
          className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-[0.75rem] font-medium transition-colors',
              filtro === f.key ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {loading && pagos.length === 0 && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        )}

        {!loading && filtrados.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-slate-400">Sin pagos para mostrar.</p>
        )}

        <AnimatePresence initial={false}>
          {filtrados.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <PaymentCard pago={p} selected={p.id === selectedId} onClick={() => onSelect(p)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
