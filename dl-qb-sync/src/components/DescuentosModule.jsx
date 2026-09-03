import { useEffect, useState } from 'react';
import { Percent, Plus, Trash2, Loader2, Check, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';
import { Modal } from './ui/Modal.jsx';
import EntitySearchBox from './EntitySearchBox.jsx';

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

const CATEGORIA = 'Jubilados';

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export default function DescuentosModule() {
  const [descuentos, setDescuentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteElegido, setClienteElegido] = useState(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [busy, setBusy] = useState(false);

  function cargar() {
    setLoading(true);
    api(`/api/descuentos?categoria=${encodeURIComponent(CATEGORIA)}`)
      .then(setDescuentos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  function abrirNuevo() {
    setClienteElegido(null);
    setPorcentaje('');
    setModalAbierto(true);
  }

  async function guardar() {
    if (!clienteElegido) {
      setError('Elige un cliente de QuickBooks');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/descuentos', {
        method: 'POST',
        body: JSON.stringify({
          categoria: CATEGORIA,
          qbCustomerId: clienteElegido.Id,
          qbDisplayName: clienteElegido.DisplayName,
          porcentaje: porcentaje === '' ? 0 : Number(porcentaje) / 100,
        }),
      });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Quitar el descuento de este cliente?')) return;
    await api(`/api/descuentos/${id}`, { method: 'DELETE' });
    cargar();
  }

  const filtrados = descuentos.filter((d) => d.qb_display_name.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><Percent size={18} /></span>
            Descuentos
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Categoría "Descuentos Por Jubilados": % que se resta de lo que se le carga a este cliente en sus pagos.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={abrirNuevo}>
          <Plus size={15} />
          Agregar cliente
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {error && !modalAbierto && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Percent size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {descuentos.length === 0 ? 'Sin clientes con descuento todavía.' : 'Ningún cliente coincide con la búsqueda.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Cliente (QuickBooks)</th>
                <th className="px-5 py-3 text-right font-semibold">Descuento</th>
                <th className="px-5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((d) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-800">{d.qb_display_name}</td>
                  <td className="px-5 py-3 text-right font-semibold text-primary">{Math.round(d.porcentaje * 100)}%</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => eliminar(d.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-danger-light hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title="Agregar cliente con descuento" maxWidth="max-w-md">
        <div className="space-y-4">
          <div>
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Cliente</span>
            {clienteElegido ? (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                <span className="text-sm font-medium text-slate-800">{clienteElegido.DisplayName}</span>
                <button onClick={() => setClienteElegido(null)} className="text-[0.78rem] font-medium text-primary underline">
                  Cambiar
                </button>
              </div>
            ) : (
              <EntitySearchBox
                endpoint="/api/qbo/customers/buscar"
                labelKey="DisplayName"
                placeholder="Buscar cliente en QuickBooks…"
                autoFocus
                onPick={setClienteElegido}
              />
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">% Descuento</span>
            <input
              type="number"
              className={inputClass}
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              placeholder="ej. 10"
            />
          </label>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" size="md" onClick={() => setModalAbierto(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={guardar} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Guardar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
