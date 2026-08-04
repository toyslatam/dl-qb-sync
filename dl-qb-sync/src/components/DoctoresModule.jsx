import { useEffect, useState } from 'react';
import { Trash2, Plus, Stethoscope } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';

const TITULOS = ['Dr.', 'Dra.', 'Dr(a).'];

const NUEVO_VACIO = {
  titulo: 'Dr.',
  nombre: '',
  apellido: '',
  especialidad: '',
  comisionPct: '',
};

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

function inputBase() {
  return 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';
}

/** Fila editable de un doctor: cada cambio se guarda solo (PATCH) al salir del campo. */
function DoctorRow({ doctor, onEliminar }) {
  const [valores, setValores] = useState(doctor);
  const [busy, setBusy] = useState(false);

  function campo(key, value) {
    setValores((v) => ({ ...v, [key]: value }));
  }

  async function guardarCampo(key, value) {
    setBusy(true);
    try {
      await api(`/api/doctores/${doctor.id}`, { method: 'PATCH', body: JSON.stringify({ [key]: value }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[90px_1fr_1fr_1fr_100px_36px] items-center gap-2 rounded-xl border border-slate-100 p-2">
      <select
        className={inputBase()}
        value={valores.titulo}
        onChange={(e) => {
          campo('titulo', e.target.value);
          guardarCampo('titulo', e.target.value);
        }}
      >
        {TITULOS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        className={inputBase()}
        value={valores.nombre}
        onChange={(e) => campo('nombre', e.target.value)}
        onBlur={(e) => guardarCampo('nombre', e.target.value)}
        placeholder="Nombre (como en la Nota del cliente)"
      />
      <input
        className={inputBase()}
        value={valores.apellido}
        onChange={(e) => campo('apellido', e.target.value)}
        onBlur={(e) => guardarCampo('apellido', e.target.value)}
        placeholder="Apellido (como en la Nota del cliente)"
      />
      <input
        className={inputBase()}
        value={valores.especialidad ?? ''}
        onChange={(e) => campo('especialidad', e.target.value)}
        onBlur={(e) => guardarCampo('especialidad', e.target.value)}
        placeholder="Especialidad"
      />
      <div className="flex items-center gap-1">
        <input
          type="number"
          step="1"
          className={inputBase()}
          value={valores.comision_pct !== undefined ? Math.round(valores.comision_pct * 100) : ''}
          onChange={(e) => campo('comision_pct', Number(e.target.value) / 100)}
          onBlur={(e) => guardarCampo('comisionPct', Number(e.target.value) / 100)}
        />
        <span className="text-xs text-slate-400">%</span>
      </div>
      <button onClick={() => onEliminar(doctor.id)} disabled={busy} className="flex h-9 w-9 items-center justify-center text-slate-300 hover:text-danger">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function DoctoresModule() {
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [error, setError] = useState('');

  function cargar() {
    setLoading(true);
    api('/api/doctores')
      .then(setDoctores)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  async function agregarDoctor() {
    if (!nuevo.nombre.trim() || !nuevo.apellido.trim()) return;
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
      setNuevo(NUEVO_VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
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
          <span className="text-[0.78rem] text-slate-400">{doctores.length} doctor(es)</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            El <strong>nombre y apellido</strong> deben coincidir exactamente con lo que se escribe en la{' '}
            <strong>"Nota para cliente"</strong> de la factura en QuickBooks — es lo que usa el módulo de Comisiones para
            identificar al doctor de cada factura.
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
              <div className="grid grid-cols-[90px_1fr_1fr_1fr_100px_36px] gap-2 px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
                <span>Título</span>
                <span>Nombre</span>
                <span>Apellido</span>
                <span>Especialidad</span>
                <span>% Comisión</span>
                <span></span>
              </div>
              {doctores.map((d) => (
                <DoctorRow key={d.id} doctor={d} onEliminar={eliminarDoctor} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-[90px_1fr_1fr_1fr_100px_36px] items-center gap-2 rounded-xl border border-dashed border-slate-200 p-2">
            <select className={inputBase()} value={nuevo.titulo} onChange={(e) => setNuevo({ ...nuevo, titulo: e.target.value })}>
              {TITULOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className={inputBase()}
              placeholder="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
            <input
              className={inputBase()}
              placeholder="Apellido"
              value={nuevo.apellido}
              onChange={(e) => setNuevo({ ...nuevo, apellido: e.target.value })}
            />
            <input
              className={inputBase()}
              placeholder="Especialidad"
              value={nuevo.especialidad}
              onChange={(e) => setNuevo({ ...nuevo, especialidad: e.target.value })}
            />
            <input
              type="number"
              className={inputBase()}
              placeholder="%"
              value={nuevo.comisionPct}
              onChange={(e) => setNuevo({ ...nuevo, comisionPct: e.target.value })}
            />
            <Button variant="primary" size="sm" onClick={agregarDoctor} className="!h-9 !w-9 !p-0">
              <Plus size={15} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
