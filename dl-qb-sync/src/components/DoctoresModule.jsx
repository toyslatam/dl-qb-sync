import { useEffect, useState } from 'react';
import { Stethoscope, Plus, Pencil, Trash2, Check, Loader2, X, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';
import { Modal } from './ui/Modal.jsx';

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Título</span>
        <select className={inputClass} value={valores.titulo} onChange={(e) => onChange({ ...valores, titulo: e.target.value })}>
          {TITULOS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">% Comisión</span>
        <input
          type="number"
          className={inputClass}
          value={valores.comisionPct}
          onChange={(e) => onChange({ ...valores, comisionPct: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Nombre</span>
        <input
          className={inputClass}
          placeholder="Como aparece en la Nota del cliente"
          value={valores.nombre}
          onChange={(e) => onChange({ ...valores, nombre: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Apellido</span>
        <input
          className={inputClass}
          placeholder="Como aparece en la Nota del cliente"
          value={valores.apellido}
          onChange={(e) => onChange({ ...valores, apellido: e.target.value })}
        />
      </label>
      <div className="sm:col-span-2">
        <label className="block">
          <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Especialidad</span>
          <input
            className={inputClass}
            value={valores.especialidad ?? ''}
            onChange={(e) => onChange({ ...valores, especialidad: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

export default function DoctoresModule() {
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [valores, setValores] = useState(VACIO);
  const [busy, setBusy] = useState(false);

  function cargar() {
    setLoading(true);
    api('/api/doctores')
      .then(setDoctores)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  function abrirNuevo() {
    setEditandoId(null);
    setValores(VACIO);
    setModalAbierto(true);
  }

  function abrirEdicion(d) {
    setEditandoId(d.id);
    setValores({
      titulo: d.titulo,
      nombre: d.nombre,
      apellido: d.apellido,
      especialidad: d.especialidad ?? '',
      comisionPct: Math.round(d.comision_pct * 100),
    });
    setModalAbierto(true);
  }

  async function guardar() {
    if (!valores.nombre.trim() || !valores.apellido.trim()) {
      setError('Nombre y apellido son requeridos');
      return;
    }
    setBusy(true);
    setError('');
    const payload = {
      titulo: valores.titulo,
      nombre: valores.nombre.trim(),
      apellido: valores.apellido.trim(),
      especialidad: valores.especialidad.trim() || null,
      comisionPct: valores.comisionPct === '' ? 0 : Number(valores.comisionPct) / 100,
    };
    try {
      if (editandoId) await api(`/api/doctores/${editandoId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/api/doctores', { method: 'POST', body: JSON.stringify(payload) });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este doctor del catálogo?')) return;
    await api(`/api/doctores/${id}`, { method: 'DELETE' });
    cargar();
  }

  const filtrados = doctores.filter((d) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return `${d.titulo} ${d.nombre} ${d.apellido} ${d.especialidad ?? ''}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><Stethoscope size={18} /></span>
            Doctores
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Catálogo de doctores para el cálculo de comisiones. El nombre y apellido deben coincidir con la Nota del cliente
            de la factura.
          </p>
        </div>
        <Button variant="primary" size="md" onClick={abrirNuevo}>
          <Plus size={15} />
          Agregar doctor
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar doctor o especialidad…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {error && !modalAbierto && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Stethoscope size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {doctores.length === 0 ? 'Sin doctores en el catálogo todavía.' : 'Ningún doctor coincide con la búsqueda.'}
            </p>
            {doctores.length === 0 && (
              <Button variant="secondary" size="sm" onClick={abrirNuevo} className="mt-1">
                <Plus size={14} />
                Agregar el primero
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Doctor</th>
                  <th className="px-5 py-3 font-semibold">Especialidad</th>
                  <th className="px-5 py-3 text-right font-semibold">Comisión</th>
                  <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {d.titulo} {d.nombre} {d.apellido}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{d.especialidad || '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-primary">{Math.round(d.comision_pct * 100)}%</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEdicion(d)}>
                          <Pencil size={13} />
                          Editar
                        </Button>
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
          </div>
        )}
      </div>

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title={editandoId ? 'Editar doctor' : 'Nuevo doctor'}>
        <DoctorForm valores={valores} onChange={setValores} />
        {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" size="md" onClick={() => setModalAbierto(false)} disabled={busy}>
            <X size={14} />
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
