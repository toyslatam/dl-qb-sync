import { useMemo, useState } from 'react';
import { Paperclip, Search, Loader2, Download, FileWarning, FileCheck2 } from 'lucide-react';
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

async function descargarBlob(res, nombreArchivo) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdjuntosModule() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [filas, setFilas] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [descargandoZip, setDescargandoZip] = useState(false);
  const [descargandoId, setDescargandoId] = useState(null);

  async function buscar() {
    setLoading(true);
    setError('');
    setSeleccionadas(new Set());
    try {
      const res = await apiFetch(`/api/adjuntos?desde=${desde}&hasta=${hasta}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setFilas(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const conAdjunto = useMemo(() => (filas ?? []).filter((f) => f.adjuntoId), [filas]);
  const todasSeleccionadas = conAdjunto.length > 0 && seleccionadas.size === conAdjunto.length;

  function alternarSeleccion(idFactura) {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(idFactura)) nuevo.delete(idFactura);
      else nuevo.add(idFactura);
      return nuevo;
    });
  }

  function alternarTodas() {
    setSeleccionadas(todasSeleccionadas ? new Set() : new Set(conAdjunto.map((f) => f.idFactura)));
  }

  async function descargarUna(f) {
    setDescargandoId(f.idFactura);
    setError('');
    try {
      const res = await apiFetch(`/api/adjuntos/${f.adjuntoId}/descargar?nombreArchivo=${encodeURIComponent(f.nombreArchivo)}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Error al descargar');
      await descargarBlob(res, f.nombreArchivo);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargandoId(null);
    }
  }

  async function descargarSeleccionadas() {
    const items = filas
      .filter((f) => seleccionadas.has(f.idFactura))
      .map((f) => ({ attachableId: f.adjuntoId, nombreArchivo: f.nombreArchivo }));
    if (items.length === 0) return;

    setDescargandoZip(true);
    setError('');
    try {
      const res = await apiFetch('/api/adjuntos/descargar-zip', { method: 'POST', body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al descargar');
      await descargarBlob(res, `adjuntos-${desde}-a-${hasta}.zip`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargandoZip(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          <span className="mr-2 inline-flex"><Paperclip size={18} /></span>
          Adjuntos
        </h1>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Desde</span>
            <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Hasta</span>
            <input type="date" className={inputClass} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <Button variant="primary" size="md" onClick={buscar} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar
          </Button>
          {seleccionadas.size > 0 && (
            <Button variant="secondary" size="md" onClick={descargarSeleccionadas} disabled={descargandoZip}>
              {descargandoZip ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Descargar seleccionadas ({seleccionadas.size})
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {filas === null && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-20 text-center shadow-card">
          <Paperclip size={32} className="text-slate-300" />
          <p className="text-sm text-slate-400">Elige un rango de fechas y presiona Buscar.</p>
        </div>
      )}

      {filas !== null && (
        <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={todasSeleccionadas} onChange={alternarTodas} disabled={conAdjunto.length === 0} />
                  </th>
                  <th className="px-4 py-3 font-semibold"># Factura</th>
                  <th className="px-4 py-3 font-semibold">Paciente</th>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-right font-semibold">Monto</th>
                  <th className="px-4 py-3 font-semibold">Adjunto</th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                      Sin facturas en este rango.
                    </td>
                  </tr>
                )}
                {filas.map((f) => (
                  <tr key={f.idFactura} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2">
                      {f.adjuntoId && (
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(f.idFactura)}
                          onChange={() => alternarSeleccion(f.idFactura)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-800">#{f.numeroFactura}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{f.paciente || '(sin paciente)'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{f.fecha}</td>
                    <td className="px-4 py-2 text-right">${f.monto.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      {f.adjuntoId ? (
                        <button
                          onClick={() => descargarUna(f)}
                          disabled={descargandoId === f.idFactura}
                          className="flex items-center gap-1.5 text-[0.82rem] font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {descargandoId === f.idFactura ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <FileCheck2 size={13} />
                          )}
                          Descargar
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[0.82rem] text-slate-400">
                          <FileWarning size={13} />
                          Sin adjunto
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
