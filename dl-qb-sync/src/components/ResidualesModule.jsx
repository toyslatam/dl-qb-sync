import { useEffect, useState } from 'react';
import { HeartPulse, Pencil, Check, Loader2, Plus, Trash2, Search, UserRound } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
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
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <HeartPulse size={16} />
              Residuales de Ortodoncia
            </span>
          </CardTitle>
          <Button variant="primary" size="md" onClick={abrirNuevo}>
            <Plus size={15} />
            Agregar caso
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Para casos como abonos de Invisalign donde queda un residual pendiente de comisionar.
          </p>

          {error && !modalAbierto && <p className="text-sm font-medium text-danger">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : casos.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Sin casos residuales todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-3">Paciente</th>
                    <th className="pb-2 pr-3">Doctor</th>
                    <th className="pb-2 pr-3 text-right">Residual</th>
                    <th className="pb-2 pr-3 text-right">Para Pagar</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {casos.map((c) => {
                    const { paraPagar } = calcular(valoresDesde(c));
                    const doctorLabel = c.doctores ? `${c.doctores.titulo} ${c.doctores.nombre} ${c.doctores.apellido}` : '—';
                    return (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-800">{c.paciente}</td>
                        <td className="py-2 pr-3 text-slate-600">{doctorLabel}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">${Number(c.monto_residual).toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right font-semibold text-primary">${paraPagar.toFixed(2)}</td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => abrirEdicion(c)}>
                              <Pencil size={13} />
                            </Button>
                            <button onClick={() => eliminarCaso(c.id)} className="flex h-8 w-8 items-center justify-center text-slate-300 hover:text-danger">
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
        </CardContent>
      </Card>

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
