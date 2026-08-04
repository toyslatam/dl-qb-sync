import { useEffect, useState } from 'react';
import { HeartPulse, Pencil, Check, Loader2, Plus, Trash2, Search, UserRound } from 'lucide-react';
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

/** Buscador de paciente contra QuickBooks: muestra el nombre elegido, con boton para buscar/cambiar. */
function PacientePicker({ valor, onElegir }) {
  const [buscando, setBuscando] = useState(false);

  if (buscando) {
    return (
      <div>
        <EntitySearchBox
          endpoint="/api/qbo/customers/buscar"
          labelKey="DisplayName"
          placeholder="Buscar cliente en QuickBooks…"
          onPick={(c) => {
            onElegir(c.DisplayName);
            setBuscando(false);
          }}
          autoFocus
        />
        <button onClick={() => setBuscando(false)} className="mt-1.5 text-[0.78rem] text-slate-400 hover:text-slate-600">
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`${inputClass} flex flex-1 items-center gap-2 text-slate-700`}>
        <UserRound size={14} className="shrink-0 text-slate-400" />
        <span className="truncate">{valor || 'Sin paciente elegido'}</span>
      </div>
      <Button variant="secondary" size="md" onClick={() => setBuscando(true)}>
        <Search size={14} />
        Buscar
      </Button>
    </div>
  );
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Paciente</span>
          <PacientePicker valor={valores.paciente} onElegir={(nombre) => setCampo('paciente', nombre)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Doctor</span>
          <select className={inputClass} value={valores.doctorId ?? ''} onChange={(e) => elegirDoctor(e.target.value || null)}>
            <option value="">(elegir doctor)</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>
                {d.titulo} {d.nombre} {d.apellido}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Abonos (soporte/detalle)</p>
        <div className="space-y-2">
          {valores.abonos.map((abono, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputClass}
                value={abono.nombre}
                onChange={(e) => actualizarAbono(i, 'nombre', e.target.value)}
              />
              <input
                type="number"
                className={`${inputClass} w-36`}
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
        <div className="mt-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={agregarAbono}>
            <Plus size={14} />
            Agregar abono
          </Button>
          <span className="text-[0.8rem] text-slate-400">Suma abonos: ${sumaAbonos.toFixed(2)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4 text-center">
        <div>
          <p className="text-[0.72rem] text-slate-400">Desc. T/C</p>
          <p className="text-base font-semibold text-slate-700">${descTC.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[0.72rem] text-slate-400">Final</p>
          <p className="text-base font-semibold text-slate-700">${final.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[0.72rem] text-slate-400">Para Pagar</p>
          <p className="text-lg font-bold text-primary">${paraPagar.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
}

export default function ResidualesModule() {
  const [casos, setCasos] = useState([]);
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null); // null = creando
  const [valores, setValores] = useState(valoresDesde(null));
  const [busy, setBusy] = useState(false);

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

  function abrirNuevo() {
    setEditandoId(null);
    setValores(valoresDesde(null));
    setModalAbierto(true);
  }

  function abrirEdicion(caso) {
    setEditandoId(caso.id);
    setValores(valoresDesde(caso));
    setModalAbierto(true);
  }

  async function guardar() {
    if (!valores.paciente.trim()) {
      setError('Elige un paciente');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editandoId) {
        await api(`/api/residuales/${editandoId}`, { method: 'PATCH', body: JSON.stringify(valores) });
      } else {
        await api('/api/residuales', { method: 'POST', body: JSON.stringify(valores) });
      }
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminarCaso(id) {
    if (!confirm('¿Eliminar este caso residual?')) return;
    await api(`/api/residuales/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><HeartPulse size={18} /></span>
            Residuales de Ortodoncia
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Casos como abonos de Invisalign donde queda un residual pendiente de comisionar.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={abrirNuevo}>
          <Plus size={15} />
          Agregar caso
        </Button>
      </div>

      {error && !modalAbierto && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : casos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <HeartPulse size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Sin casos residuales todavía.</p>
            <p className="max-w-sm text-[0.85rem] text-slate-400">
              Cuando quede un residual de comisión pendiente (ej. abonos de Invisalign), agrégalo aquí.
            </p>
            <Button variant="secondary" size="sm" onClick={abrirNuevo} className="mt-1">
              <Plus size={14} />
              Agregar el primero
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Paciente</th>
                  <th className="px-5 py-3 font-semibold">Doctor</th>
                  <th className="px-5 py-3 text-right font-semibold">Residual</th>
                  <th className="px-5 py-3 text-right font-semibold">Para pagar</th>
                  <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => {
                  const { paraPagar } = calcular(valoresDesde(c));
                  const doctorLabel = c.doctores ? `${c.doctores.titulo} ${c.doctores.nombre} ${c.doctores.apellido}` : '—';
                  return (
                    <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-800">{c.paciente}</td>
                      <td className="px-5 py-3 text-slate-500">{doctorLabel}</td>
                      <td className="px-5 py-3 text-right text-slate-600">${Number(c.monto_residual).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-primary">${paraPagar.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicion(c)}>
                            <Pencil size={13} />
                            Editar
                          </Button>
                          <button
                            onClick={() => eliminarCaso(c.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-danger-light hover:text-danger"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editandoId ? 'Editar caso residual' : 'Nuevo caso residual'}
        maxWidth="max-w-3xl"
      >
        <ResidualForm valores={valores} onChange={setValores} doctores={doctores} />
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
