import { useState } from 'react';
import { Calculator, Download, Loader2, DollarSign, FileText } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';

function hoy() {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const h = hoy();
  return `${h.slice(0, 7)}-01`;
}

const inputClass =
  'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="flex-1 rounded-card border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-1.5 flex items-center gap-1.5 text-slate-400">
        <Icon size={14} />
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-primary">{value}</p>
    </div>
  );
}

/**
 * Version de solo lectura de Comisiones para un doctor individual. El
 * backend (/api/comisiones) ya filtra los datos a solo lo que corresponde a
 * este usuario segun su login -- este componente nunca decide que mostrar,
 * solo pinta lo que llega.
 */
export default function MiComisionModule({ doctor }) {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  async function calcular() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/comisiones', { method: 'POST', body: JSON.stringify({ desde, hasta }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setResultado(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function descargar() {
    setDescargando(true);
    setError('');
    try {
      const res = await apiFetch('/api/comisiones/descargar', { method: 'POST', body: JSON.stringify({ desde, hasta }) });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al descargar');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mi-comision-${desde}-a-${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><Calculator size={18} /></span>
            Mi Comisión
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {doctor.titulo} {doctor.nombre} {doctor.apellido}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Desde</span>
            <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Hasta</span>
            <input type="date" className={inputClass} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <Button variant="primary" size="md" onClick={calcular} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            Calcular
          </Button>
          {resultado && (
            <Button variant="secondary" size="md" onClick={descargar} disabled={descargando}>
              {descargando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Descargar Excel
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {!resultado && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-20 text-center shadow-card">
          <Calculator size={32} className="text-slate-300" />
          <p className="text-sm text-slate-400">Elige un rango de fechas y presiona Calcular.</p>
        </div>
      )}

      {resultado && (
        <>
          <div className="flex flex-wrap gap-3">
            <StatTile icon={DollarSign} label="Total Comisión" value={`$${resultado.totalGeneral.toFixed(2)}`} />
            <StatTile icon={FileText} label="Facturas" value={resultado.facturasEncontradas} />
          </div>

          <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 font-semibold"># Pago</th>
                    <th className="px-4 py-3 font-semibold">Paciente</th>
                    <th className="px-4 py-3 font-semibold">Prestación</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Medio de pago</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 text-right font-semibold">Laboratorios</th>
                    <th className="px-4 py-3 text-right font-semibold">Insumos</th>
                    <th className="px-4 py-3 text-right font-semibold">Base</th>
                    <th className="px-4 py-3 text-right font-semibold">% Com.</th>
                    <th className="px-4 py-3 text-right font-semibold">Comisión</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">
                        Sin comisiones en este rango.
                      </td>
                    </tr>
                  )}
                  {resultado.filas.map((f, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2">{f.numeroPago}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {f.nombrePaciente} {f.apellidosPaciente}
                      </td>
                      <td className="px-4 py-2 max-w-[220px] truncate" title={f.prestacion}>
                        {f.prestacion}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{f.fechaRecepcionPago}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{f.medioPago}</td>
                      <td className="px-4 py-2 text-right">${f.totalAsociado.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{f.laboratorios ? `$${f.laboratorios.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2 text-right">{f.insumos ? `$${f.insumos.toFixed(2)}` : '—'}</td>
                      <td className="px-4 py-2 text-right">${f.base.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">
                        {f.excepcion ? <span className="text-[0.72rem] font-medium text-slate-400">excepción</span> : `${Math.round(f.comisionPct * 100)}%`}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-primary">${f.comisionAPagar.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
