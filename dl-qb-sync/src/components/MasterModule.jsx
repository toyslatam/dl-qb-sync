import { useEffect, useState } from 'react';
import { Landmark, Pencil, Check, X, Loader2, Plus, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';
import { Modal } from './ui/Modal.jsx';

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export default function MasterModule() {
  const [metodos, setMetodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null); // medio_pago en edicion
  const [porcentajeEdit, setPorcentajeEdit] = useState('');
  const [busy, setBusy] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nuevoMedio, setNuevoMedio] = useState('');
  const [nuevoPct, setNuevoPct] = useState('');

  function cargar() {
    setLoading(true);
    api('/api/master/metodos-pago')
      .then(setMetodos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  function empezarEdicion(m) {
    setEditando(m.medio_pago);
    setPorcentajeEdit(Math.round(m.porcentaje * 1000) / 10);
  }

  async function guardarEdicion() {
    setBusy(true);
    setError('');
    try {
      await api('/api/master/metodos-pago', {
        method: 'POST',
        body: JSON.stringify({ medioPago: editando, porcentaje: Number(porcentajeEdit) / 100 }),
      });
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function agregarMetodo() {
    if (!nuevoMedio.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/master/metodos-pago', {
        method: 'POST',
        body: JSON.stringify({ medioPago: nuevoMedio.trim(), porcentaje: nuevoPct === '' ? 0 : Number(nuevoPct) / 100 }),
      });
      setNuevoMedio('');
      setNuevoPct('');
      setAgregando(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filtrados = metodos.filter((m) => m.medio_pago.toLowerCase().includes(busqueda.trim().toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><Landmark size={18} /></span>
            Master
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            % de descuento por método de pago que se resta antes de calcular la comisión del doctor.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setAgregando(true)}>
          <Plus size={15} />
          Agregar medio de pago
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar método de pago…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Landmark size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Ningún método de pago coincide con la búsqueda.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Método de pago</th>
                <th className="px-5 py-3 text-right font-semibold">Descuento</th>
                <th className="px-5 py-3 text-right font-semibold">Editar</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => (
                <tr key={m.medio_pago} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-800">{m.medio_pago}</td>
                  <td className="px-5 py-3 text-right">
                    {editando === m.medio_pago ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.1"
                          autoFocus
                          value={porcentajeEdit}
                          onChange={(e) => setPorcentajeEdit(e.target.value)}
                          className={`${inputClass} w-24 text-right`}
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    ) : (
                      <span className="font-semibold text-primary">{(m.porcentaje * 100).toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {editando === m.medio_pago ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEditando(null)} disabled={busy}>
                            <X size={13} />
                          </Button>
                          <Button variant="primary" size="sm" onClick={guardarEdicion} disabled={busy}>
                            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Guardar
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => empezarEdicion(m)}>
                          <Pencil size={13} />
                          Editar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={agregando} onClose={() => setAgregando(false)} title="Agregar medio de pago" maxWidth="max-w-md">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Nombre</span>
            <input className={inputClass} value={nuevoMedio} onChange={(e) => setNuevoMedio(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">% Descuento</span>
            <input type="number" className={inputClass} value={nuevoPct} onChange={(e) => setNuevoPct(e.target.value)} />
          </label>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" size="md" onClick={() => setAgregando(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" size="md" onClick={agregarMetodo} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            Guardar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
