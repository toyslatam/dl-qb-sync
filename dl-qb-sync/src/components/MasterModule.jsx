import { useEffect, useState } from 'react';
import { Landmark, Pencil, Check, X, Loader2, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

function MetodoRow({ metodo, onGuardar }) {
  const [editando, setEditando] = useState(false);
  const [porcentaje, setPorcentaje] = useState(Math.round(metodo.porcentaje * 1000) / 10);
  const [busy, setBusy] = useState(false);

  async function guardar() {
    setBusy(true);
    try {
      await onGuardar(metodo.medio_pago, Number(porcentaje) / 100);
      setEditando(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-slate-200">
      <span className="text-sm font-medium text-slate-800">{metodo.medio_pago}</span>
      {editando ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              autoFocus
              className={`${inputClass} w-24`}
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
            />
            <span className="text-xs text-slate-400">%</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)} disabled={busy}>
            <X size={14} />
          </Button>
          <Button variant="primary" size="sm" onClick={guardar} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-primary">{(metodo.porcentaje * 100).toFixed(1)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={14} />
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MasterModule() {
  const [metodos, setMetodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [guardadoHint, setGuardadoHint] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [nuevoMedio, setNuevoMedio] = useState('');
  const [nuevoPct, setNuevoPct] = useState('');
  const [busyNuevo, setBusyNuevo] = useState(false);

  function cargar() {
    setLoading(true);
    api('/api/master/metodos-pago')
      .then(setMetodos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  async function guardarMetodo(medioPago, porcentaje) {
    setError('');
    try {
      await api('/api/master/metodos-pago', { method: 'POST', body: JSON.stringify({ medioPago, porcentaje }) });
      setGuardadoHint('Actualizado');
      setTimeout(() => setGuardadoHint(''), 1800);
      cargar();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function agregarMetodo() {
    if (!nuevoMedio.trim()) return;
    setBusyNuevo(true);
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
      setBusyNuevo(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Landmark size={16} />
              Master · % Descuento por Método de Pago
            </span>
          </CardTitle>
          {guardadoHint && <span className="text-[0.78rem] font-medium text-success">{guardadoHint}</span>}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Este porcentaje se descuenta del total de la factura antes de calcular la comisión del doctor (comisión sobre pagos
            en tarjeta, por ejemplo, se reduce por el costo de procesamiento).
          </p>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {metodos.map((m) => (
                <MetodoRow key={m.medio_pago} metodo={m} onGuardar={guardarMetodo} />
              ))}
            </div>
          )}

          {agregando ? (
            <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-3">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Nombre del medio de pago"
                  value={nuevoMedio}
                  onChange={(e) => setNuevoMedio(e.target.value)}
                />
                <div className="flex w-28 items-center gap-1">
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="%"
                    value={nuevoPct}
                    onChange={(e) => setNuevoPct(e.target.value)}
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAgregando(false)} disabled={busyNuevo}>
                  <X size={14} />
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={agregarMetodo} disabled={busyNuevo}>
                  {busyNuevo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="md" onClick={() => setAgregando(true)}>
              <Plus size={15} />
              Agregar medio de pago
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
