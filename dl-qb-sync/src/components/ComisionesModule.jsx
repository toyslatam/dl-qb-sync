import { useState } from 'react';
import { Calculator, Download, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
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

export default function ComisionesModule() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');

  async function calcular() {
    setLoading(true);
    setError('');
    setResultado(null);
    try {
      const res = await apiFetch(`/api/comisiones?desde=${desde}&hasta=${hasta}`);
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
      const res = await apiFetch(`/api/comisiones/descargar?desde=${desde}&hasta=${hasta}`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al descargar');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comisiones-${desde}-a-${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Calculator size={16} />
              Comisiones
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Lee directo de QuickBooks (facturas del rango) — no crea ni modifica nada allá. Laboratorios queda en $0 por ahora
            (esa integración va en una fase posterior).
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Desde</span>
              <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Hasta</span>
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

          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </CardContent>
      </Card>

      {resultado && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Resumen por doctor</CardTitle>
              <span className="text-sm font-bold text-primary">Total: ${resultado.totalGeneral.toFixed(2)}</span>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {resultado.resumen.length === 0 && <p className="text-sm text-slate-400">Sin comisiones en este rango.</p>}
              {resultado.resumen.map((r) => (
                <div key={r.doctor} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                  <span className="text-sm font-medium text-slate-800">{r.doctor}</span>
                  <span className="text-sm font-semibold text-primary">${r.total.toFixed(2)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalle ({resultado.filas.length} factura(s))</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-3">Doctor</th>
                      <th className="pb-2 pr-3"># Pago</th>
                      <th className="pb-2 pr-3">Paciente</th>
                      <th className="pb-2 pr-3">Medio de pago</th>
                      <th className="pb-2 pr-3 text-right">Total</th>
                      <th className="pb-2 pr-3 text-right">Base</th>
                      <th className="pb-2 pr-3 text-right">% Com.</th>
                      <th className="pb-2 text-right">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.filas.map((f, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{f.doctor}</td>
                        <td className="py-1.5 pr-3">{f.numeroPago}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {f.nombrePaciente} {f.apellidosPaciente}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{f.medioPago}</td>
                        <td className="py-1.5 pr-3 text-right">${f.totalAsociado.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right">${f.base.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right">{Math.round(f.comisionPct * 100)}%</td>
                        <td className="py-1.5 text-right font-semibold text-primary">${f.comisionAPagar.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
