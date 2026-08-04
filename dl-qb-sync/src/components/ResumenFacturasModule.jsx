import { useState } from 'react';
import { ClipboardList, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import StatusBadge from './StatusBadge.jsx';

function hoy() {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  return `${hoy().slice(0, 7)}-01`;
}

const inputClass =
  'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

/** Vista de solo lectura: resumen de estados de facturacion con filtro de fechas, para usuarios sin acceso al resto de la app. */
export default function ResumenFacturasModule() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [pagos, setPagos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function buscar() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/pagos?desde=${desde}&hasta=${hasta}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setPagos(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const conteo = pagos
    ? {
        pendiente: pagos.filter((p) => p.estado === 'pendiente').length,
        en_cola: pagos.filter((p) => p.estado === 'en_cola').length,
        sincronizado: pagos.filter((p) => p.estado === 'sincronizado').length,
      }
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          <span className="mr-2 inline-flex"><ClipboardList size={18} /></span>
          Resumen de facturación
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">Estado de los pagos por rango de fechas (solo lectura).</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Desde</span>
          <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Hasta</span>
          <input type="date" className={inputClass} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button
          onClick={buscar}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
          Buscar
        </button>

        {conteo && (
          <div className="ml-auto flex gap-2 text-[0.78rem]">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600">{conteo.pendiente} pendientes</span>
            <span className="rounded-full bg-warning-light px-3 py-1.5 font-medium text-warning">{conteo.en_cola} en revisión</span>
            <span className="rounded-full bg-success-light px-3 py-1.5 font-medium text-success">{conteo.sincronizado} procesados</span>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
        {pagos === null ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <ClipboardList size={32} className="text-slate-300" />
            <p className="text-sm text-slate-400">Elige un rango de fechas y presiona Buscar.</p>
          </div>
        ) : pagos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <ClipboardList size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Sin pagos en ese rango.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold"># Pago</th>
                  <th className="px-5 py-3 font-semibold">Paciente</th>
                  <th className="px-5 py-3 font-semibold">Fecha</th>
                  <th className="px-5 py-3 font-semibold">Medio de pago</th>
                  <th className="px-5 py-3 text-right font-semibold">Monto</th>
                  <th className="px-5 py-3 text-right font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-500">{p.id}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{p.nombrePaciente || `#${p.idPaciente}`}</td>
                    <td className="px-5 py-3 text-slate-500">{p.fechaRecepcion}</td>
                    <td className="px-5 py-3 text-slate-500">{p.medioPago || '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">
                      ${Number(p.monto ?? 0).toLocaleString('es-PA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge estado={p.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
