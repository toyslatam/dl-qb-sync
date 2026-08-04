import { useEffect, useState } from 'react';
import { HeartPulse, Pencil, Check, X, Loader2, Plus, Trash2 } from 'lucide-react';
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

function num(v) {
  return Number(v) || 0;
}

/** Calcula Desc T/C, Final y Comision a pagar a partir del residual, igual que el Excel. */
function calcular({ montoResidual, descuentoPct, comisionPct }) {
  const residual = num(montoResidual);
  const descTC = residual * num(descuentoPct);
  const final = residual - descTC;
  const paraPagar = final * num(comisionPct);
  return { descTC, final, paraPagar };
}

function ResidualForm({ valores, onChange, doctores }) {
  function setCampo(campo, valor) {
    onChange({ ...valores, [campo]: valor });
  }

  function elegirDoctor(doctorId) {
    const doctor = doctores.find((d) => String(d.id) === String(doctorId));
    onChange({ ...valores, doctorId, comisionPct: doctor ? Math.round(doctor.comision_pct * 100) : valores.comisionPct });
  }

  function actualizarAbono(i, campo, valor) {
    const abonos = valores.abonos.map((a, idx) => (idx === i ? { ...a, [campo]: valor } : a));
    setCampo('abonos', abonos);
  }

  function agregarAbono() {
    setCampo('abonos', [...valores.abonos, { nombre: `Abono ${valores.abonos.length + 1}`, monto: '' }]);
  }

  function eliminarAbono(i) {
    setCampo(
      'abonos',
      valores.abonos.filter((_, idx) => idx !== i)
    );
  }

  const sumaAbonos = valores.abonos.reduce((sum, a) => sum + num(a.monto), 0);
  const { descTC, final, paraPagar } = calcular(valores);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="Paciente"
          value={valores.paciente}
          onChange={(e) => setCampo('paciente', e.target.value)}
        />
        <select className={inputClass} value={valores.doctorId ?? ''} onChange={(e) => elegirDoctor(e.target.value || null)}>
          <option value="">(elegir doctor)</option>
          {doctores.map((d) => (
            <option key={d.id} value={d.id}>
              {d.titulo} {d.nombre} {d.apellido}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Abonos (soporte/detalle)</p>
        <div className="space-y-1.5">
          {valores.abonos.map((abono, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputClass}
                value={abono.nombre}
                onChange={(e) => actualizarAbono(i, 'nombre', e.target.value)}
              />
              <input
                type="number"
                className={`${inputClass} w-32`}
                placeholder="Monto"
                value={abono.monto}
                onChange={(e) => actualizarAbono(i, 'monto', e.target.value)}
              />
              <button onClick={() => eliminarAbono(i)} className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-300 hover:text-danger">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={agregarAbono}>
            <Plus size={14} />
            Agregar abono
          </Button>
          <span className="text-[0.78rem] text-slate-400">Suma abonos: ${sumaAbonos.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Monto Residual</span>
          <input
            type="number"
            className={inputClass}
            value={valores.montoResidual}
            onChange={(e) => setCampo('montoResidual', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">% Descuento (T/C)</span>
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={Math.round(num(valores.descuentoPct) * 1000) / 10}
            onChange={(e) => setCampo('descuentoPct', num(e.target.value) / 100)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">% Comisión</span>
          <input
            type="number"
            className={inputClass}
            value={Math.round(num(valores.comisionPct) * 100)}
            onChange={(e) => setCampo('comisionPct', num(e.target.value) / 100)}
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
        <div>
          <p className="text-[0.7rem] text-slate-400">Desc. T/C</p>
          <p className="text-sm font-semibold text-slate-700">${descTC.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[0.7rem] text-slate-400">Final</p>
          <p className="text-sm font-semibold text-slate-700">${final.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[0.7rem] text-slate-400">Para Pagar</p>
          <p className="text-sm font-bold text-primary">${paraPagar.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

function valoresDesde(caso) {
  return {
    paciente: caso?.paciente ?? '',
    doctorId: caso?.doctor_id ?? null,
    abonos: caso?.abonos?.length ? caso.abonos : [{ nombre: 'Abono 1', monto: '' }],
    montoResidual: caso?.monto_residual ?? '',
    descuentoPct: caso?.descuento_pct ?? 0.027,
    comisionPct: caso?.comision_pct ?? 0,
  };
}

function ResidualRow({ caso, doctores, onGuardar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(null);
  const [busy, setBusy] = useState(false);

  function empezarEdicion() {
    setValores(valoresDesde(caso));
    setEditando(true);
  }

  async function guardar() {
    setBusy(true);
    try {
      await onGuardar(caso.id, valores);
      setEditando(false);
    } finally {
      setBusy(false);
    }
  }

  const { paraPagar } = calcular(valoresDesde(caso));
  const doctorLabel = caso.doctores ? `${caso.doctores.titulo} ${caso.doctores.nombre} ${caso.doctores.apellido}` : '(sin doctor)';

  if (editando) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-3">
        <ResidualForm valores={valores} onChange={setValores} doctores={doctores} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)} disabled={busy}>
            <X size={14} />
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={guardar} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Guardar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-slate-200">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{caso.paciente}</p>
        <p className="truncate text-[0.78rem] text-slate-400">{doctorLabel}</p>
      </div>
      <span className="text-sm font-bold text-primary">${paraPagar.toFixed(2)}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={empezarEdicion}>
          <Pencil size={14} />
          Editar
        </Button>
        <button onClick={() => onEliminar(caso.id)} className="flex h-9 w-9 items-center justify-center text-slate-300 hover:text-danger">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export default function ResidualesModule() {
  const [casos, setCasos] = useState([]);
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState(valoresDesde(null));
  const [busyNuevo, setBusyNuevo] = useState(false);

  function cargar() {
    setLoading(true);
    Promise.all([api('/api/residuales'), api('/api/doctores')])
      .then(([r, d]) => {
        setCasos(r);
        setDoctores(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  async function guardarCaso(id, valores) {
    setError('');
    try {
      await api(`/api/residuales/${id}`, { method: 'PATCH', body: JSON.stringify(valores) });
      cargar();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function agregarCaso() {
    if (!nuevo.paciente.trim()) return;
    setBusyNuevo(true);
    setError('');
    try {
      await api('/api/residuales', { method: 'POST', body: JSON.stringify(nuevo) });
      setNuevo(valoresDesde(null));
      setAgregando(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyNuevo(false);
    }
  }

  async function eliminarCaso(id) {
    if (!confirm('¿Eliminar este caso residual?')) return;
    await api(`/api/residuales/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <HeartPulse size={16} />
              Residuales de Ortodoncia
            </span>
          </CardTitle>
          <span className="text-[0.78rem] text-slate-400">{casos.length} caso(s)</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Para casos como abonos de Invisalign donde queda un residual pendiente de comisionar. El monto residual y los
            abonos se escriben a mano (es una reconciliación caso por caso); el descuento, el final y la comisión a pagar se
            calculan solos.
          </p>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {casos.map((c) => (
                <ResidualRow key={c.id} caso={c} doctores={doctores} onGuardar={guardarCaso} onEliminar={eliminarCaso} />
              ))}
            </div>
          )}

          {agregando ? (
            <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-3">
              <ResidualForm valores={nuevo} onChange={setNuevo} doctores={doctores} />
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAgregando(false);
                    setNuevo(valoresDesde(null));
                  }}
                  disabled={busyNuevo}
                >
                  <X size={14} />
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={agregarCaso} disabled={busyNuevo}>
                  {busyNuevo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="md" onClick={() => setAgregando(true)}>
              <Plus size={15} />
              Agregar caso residual
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
