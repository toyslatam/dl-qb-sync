import { useEffect, useState } from 'react';
import { Trash2, Plus, Stethoscope, Pencil, Check, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';

const TITULOS = ['Dr.', 'Dra.', 'Dr(a).'];

const VACIO = { titulo: 'Dr.', nombre: '', apellido: '', especialidad: '', comisionPct: '' };

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

function DoctorForm({ valores, onChange }) {
  return (
    <div className="grid grid-cols-[90px_1fr_1fr_1fr_110px] gap-2">
      <select className={inputClass} value={valores.titulo} onChange={(e) => onChange({ ...valores, titulo: e.target.value })}>
        {TITULOS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        className={inputClass}
        placeholder="Nombre"
        value={valores.nombre}
        onChange={(e) => onChange({ ...valores, nombre: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Apellido"
        value={valores.apellido}
        onChange={(e) => onChange({ ...valores, apellido: e.target.value })}
      />
      <input
        className={inputClass}
        placeholder="Especialidad"
        value={valores.especialidad ?? ''}
        onChange={(e) => onChange({ ...valores, especialidad: e.target.value })}
      />
      <div className="flex items-center gap-1">
        <input
          type="number"
          className={inputClass}
          placeholder="%"
          value={valores.comisionPct}
          onChange={(e) => onChange({ ...valores, comisionPct: e.target.value })}
        />
        <span className="text-xs text-slate-400">%</span>
      </div>
    </div>
  );
}

/** Fila de doctor: en modo lectura por defecto, "Editar" la vuelve un formulario con Guardar/Cancelar explicitos. */
function DoctorRow({ doctor, onGuardar, onEliminar }) {
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState(null);
  const [busy, setBusy] = useState(false);

  function empezarEdicion() {
    setValores({
      titulo: doctor.titulo,
      nombre: doctor.nombre,
      apellido: doctor.apellido,
      especialidad: doctor.especialidad ?? '',
      comisionPct: Math.round(doctor.comision_pct * 100),
    });
    setEditando(true);
  }

  async function guardar() {
    setBusy(true);
    try {
      await onGuardar(doctor.id, valores);
      setEditando(false);
    } finally {
      setBusy(false);
    }
  }

  if (editando) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-3">
        <DoctorForm valores={valores} onChange={setValores} />
        <div className="mt-2 flex justify-end gap-2">
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
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="w-52 shrink-0 truncate text-sm font-medium text-slate-800">
          {doctor.titulo} {doctor.nombre} {doctor.apellido}
        </span>
        <span className="w-40 shrink-0 truncate text-sm text-slate-500">{doctor.especialidad || '—'}</span>
        <span className="text-sm font-semibold text-primary">{Math.round(doctor.comision_pct * 100)}%</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={empezarEdicion}>
          <Pencil size={14} />
          Editar
        </Button>
        <button onClick={() => onEliminar(doctor.id)} className="flex h-9 w-9 items-center justify-center text-slate-300 hover:text-danger">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export default function DoctoresModule() {
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState(VACIO);
  const [busyNuevo, setBusyNuevo] = useState(false);
  const [error, setError] = useState('');
  const [guardadoHint, setGuardadoHint] = useState('');

  function cargar() {
    setLoading(true);
    api('/api/doctores')
      .then(setDoctores)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  async function guardarDoctor(id, valores) {
    setError('');
    try {
      await api(`/api/doctores/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          titulo: valores.titulo,
          nombre: valores.nombre.trim(),
          apellido: valores.apellido.trim(),
          especialidad: valores.especialidad.trim() || null,
          comisionPct: valores.comisionPct === '' ? 0 : Number(valores.comisionPct) / 100,
        }),
      });
      setGuardadoHint('Doctor actualizado');
      setTimeout(() => setGuardadoHint(''), 1800);
      cargar();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function agregarDoctor() {
    if (!nuevo.nombre.trim() || !nuevo.apellido.trim()) return;
    setBusyNuevo(true);
    setError('');
    try {
      await api('/api/doctores', {
        method: 'POST',
        body: JSON.stringify({
          titulo: nuevo.titulo,
          nombre: nuevo.nombre.trim(),
          apellido: nuevo.apellido.trim(),
          especialidad: nuevo.especialidad.trim() || null,
          comisionPct: nuevo.comisionPct === '' ? 0 : Number(nuevo.comisionPct) / 100,
        }),
      });
      setNuevo(VACIO);
      setAgregando(false);
      setGuardadoHint('Doctor agregado');
      setTimeout(() => setGuardadoHint(''), 1800);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyNuevo(false);
    }
  }

  async function eliminarDoctor(id) {
    if (!confirm('¿Eliminar este doctor del catálogo?')) return;
    await api(`/api/doctores/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Stethoscope size={16} />
              Doctores
            </span>
          </CardTitle>
          <div className="flex items-center gap-3">
            {guardadoHint && <span className="text-[0.78rem] font-medium text-success">{guardadoHint}</span>}
            <span className="text-[0.78rem] text-slate-400">{doctores.length} doctor(es)</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            El <strong>nombre y apellido</strong> deben coincidir exactamente con lo que se escribe en la{' '}
            <strong>"Nota para cliente"</strong> de la factura en QuickBooks.
          </p>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {doctores.map((d) => (
                <DoctorRow key={d.id} doctor={d} onGuardar={guardarDoctor} onEliminar={eliminarDoctor} />
              ))}
            </div>
          )}

          {agregando ? (
            <div className="rounded-xl border border-primary/30 bg-primary-light/40 p-3">
              <DoctorForm valores={nuevo} onChange={setNuevo} />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAgregando(false);
                    setNuevo(VACIO);
                  }}
                  disabled={busyNuevo}
                >
                  <X size={14} />
                  Cancelar
                </Button>
                <Button variant="primary" size="sm" onClick={agregarDoctor} disabled={busyNuevo}>
                  {busyNuevo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="md" onClick={() => setAgregando(true)}>
              <Plus size={15} />
              Agregar nuevo doctor
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
