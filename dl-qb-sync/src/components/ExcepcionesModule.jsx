import { useEffect, useState } from 'react';
import { ShieldOff, Plus, Trash2, Loader2, Check, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Button } from './ui/Button.jsx';
import { Modal } from './ui/Modal.jsx';
import SearchableSelect from './ui/SearchableSelect.jsx';

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export default function ExcepcionesModule() {
  const [excepciones, setExcepciones] = useState([]);
  const [doctores, setDoctores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [doctorId, setDoctorId] = useState(null);
  const [patron, setPatron] = useState('');
  const [busy, setBusy] = useState(false);

  function cargar() {
    setLoading(true);
    Promise.all([api('/api/excepciones'), api('/api/doctores')])
      .then(([exc, docs]) => {
        setExcepciones(exc);
        setDoctores(docs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  function abrirNueva() {
    setDoctorId(null);
    setPatron('');
    setModalAbierto(true);
  }

  async function guardar() {
    if (!doctorId || !patron.trim()) {
      setError('Elige un doctor y escribe el texto de la prestación');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/excepciones', { method: 'POST', body: JSON.stringify({ doctorId, patronPrestacion: patron.trim() }) });
      setModalAbierto(false);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Quitar esta excepción? Esa prestación volverá a cobrar comisión normal.')) return;
    await api(`/api/excepciones/${id}`, { method: 'DELETE' });
    cargar();
  }

  const filtradas = excepciones.filter((e) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    const doc = e.doctores ? `${e.doctores.nombre} ${e.doctores.apellido}` : '';
    return `${doc} ${e.patron_prestacion}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><ShieldOff size={18} /></span>
            Excepciones
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Prestaciones que, para un doctor específico, siempre cargan comisión en $0 (ej. abonos de Invisalign).
          </p>
        </div>
        <Button variant="primary" size="md" onClick={abrirNueva}>
          <Plus size={15} />
          Agregar excepción
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar doctor o prestación…"
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
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <ShieldOff size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {excepciones.length === 0 ? 'Sin excepciones todavía.' : 'Ninguna excepción coincide con la búsqueda.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">Doctor</th>
                <th className="px-5 py-3 font-semibold">Prestación (contiene)</th>
                <th className="px-5 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {e.doctores ? `${e.doctores.titulo} ${e.doctores.nombre} ${e.doctores.apellido}` : '(doctor eliminado)'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{e.patron_prestacion}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      <button
                        onClick={() => eliminar(e.id)}
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

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title="Nueva excepción" maxWidth="max-w-md">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Doctor</span>
            <SearchableSelect
              options={doctores.map((d) => ({ value: d.id, label: `${d.titulo} ${d.nombre} ${d.apellido}` }))}
              value={doctorId}
              onChange={setDoctorId}
              placeholder="(elegir doctor)"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">
              Texto de la prestación
            </span>
            <input
              className={inputClass}
              placeholder="ej. abono invisalign"
              value={patron}
              onChange={(e) => setPatron(e.target.value)}
            />
            <p className="mt-1 text-[0.75rem] text-slate-400">
              Cualquier prestación de este doctor que contenga este texto (sin importar mayúsculas, tildes, ni si dice
              "1-3", "2-3", etc.) cargará comisión en $0.
            </p>
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
