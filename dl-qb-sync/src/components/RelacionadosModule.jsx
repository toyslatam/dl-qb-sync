import { useEffect, useState } from 'react';
import { Link2, Plus, Trash2, Loader2, Search, Check, X, UserCheck } from 'lucide-react';
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

const PASO_PACIENTE = 'paciente';
const PASO_DESTINO = 'destino';

function nombreCompletoPaciente(p) {
  return `${p.nombre ?? ''} ${p.apellidos ?? ''}`.trim();
}

function NuevoRelacionModal({ open, onClose, onCreada }) {
  const [paso, setPaso] = useState(PASO_PACIENTE);
  const [idPaciente, setIdPaciente] = useState('');
  const [paciente, setPaciente] = useState(null);
  const [modo, setModo] = useState('existente'); // 'existente' | 'nuevo'
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [correo, setCorreo] = useState('');
  const [ruc, setRuc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setPaso(PASO_PACIENTE);
    setIdPaciente('');
    setPaciente(null);
    setModo('existente');
    setNombreCompleto('');
    setCorreo('');
    setRuc('');
    setError('');
  }

  async function buscarPaciente() {
    if (!idPaciente.trim()) return;
    setBusy(true);
    setError('');
    try {
      const p = await api(`/api/dentalink/pacientes/${idPaciente.trim()}`);
      setPaciente(p);
    } catch (err) {
      setError(err.message);
      setPaciente(null);
    } finally {
      setBusy(false);
    }
  }

  async function relacionarConExistente(customer) {
    setBusy(true);
    setError('');
    try {
      await api('/api/relacionados', {
        method: 'POST',
        body: JSON.stringify({
          idPacienteDentalink: paciente.id,
          nombrePaciente: nombreCompletoPaciente(paciente),
          qbCustomerId: customer.Id,
          qbDisplayName: customer.DisplayName,
        }),
      });
      onCreada();
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function crearYRelacionar() {
    if (!nombreCompleto.trim()) {
      setError('El nombre completo es requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/relacionados/crear-cliente', {
        method: 'POST',
        body: JSON.stringify({
          idPacienteDentalink: paciente.id,
          nombrePaciente: nombreCompletoPaciente(paciente),
          nombreCompleto: nombreCompleto.trim(),
          correo: correo.trim() || null,
          ruc: ruc.trim() || null,
        }),
      });
      onCreada();
      reset();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Relacionar paciente con otro cliente"
    >
      {paso === PASO_PACIENTE && (
        <div>
          <label className="block">
            <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">
              ID del paciente en Dentalink
            </span>
            <div className="flex gap-2">
              <input
                autoFocus
                value={idPaciente}
                onChange={(e) => setIdPaciente(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarPaciente()}
                placeholder="ej. 2586"
                className={inputClass}
              />
              <Button variant="primary" size="md" onClick={buscarPaciente} disabled={busy}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Buscar
              </Button>
            </div>
          </label>

          {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}

          {paciente && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{nombreCompletoPaciente(paciente)}</p>
                <p className="text-[0.78rem] text-slate-500">
                  RUC: {paciente.rut || '—'} · {paciente.email || 'sin correo'}
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={() => setPaso(PASO_DESTINO)}>
                Es este paciente
                <Check size={14} />
              </Button>
            </div>
          )}
        </div>
      )}

      {paso === PASO_DESTINO && (
        <div>
          <div className="mb-4 flex items-center justify-between rounded-xl border border-primary/20 bg-primary-light px-4 py-2.5">
            <p className="text-sm font-semibold text-primary">{nombreCompletoPaciente(paciente)}</p>
            <button onClick={() => setPaso(PASO_PACIENTE)} className="text-[0.78rem] font-medium text-primary underline">
              Cambiar
            </button>
          </div>

          <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setModo('existente')}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${modo === 'existente' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Cliente ya existe
            </button>
            <button
              onClick={() => setModo('nuevo')}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${modo === 'nuevo' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Crear cliente relacionado
            </button>
          </div>

          {modo === 'existente' ? (
            <EntitySearchBox
              endpoint="/api/qbo/customers/buscar"
              labelKey="DisplayName"
              placeholder="Buscar cliente en QuickBooks…"
              autoFocus
              onPick={relacionarConExistente}
            />
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Nombre completo</span>
                <input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Correo</span>
                <input value={correo} onChange={(e) => setCorreo(e.target.value)} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">RUC</span>
                <input value={ruc} onChange={(e) => setRuc(e.target.value)} className={inputClass} />
              </label>
              <div className="flex justify-end pt-1">
                <Button variant="primary" size="md" onClick={crearYRelacionar} disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  Crear y relacionar
                </Button>
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm font-medium text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export default function RelacionadosModule() {
  const [relaciones, setRelaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  function cargar() {
    setLoading(true);
    api('/api/relacionados')
      .then(setRelaciones)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(cargar, []);

  async function quitar(id) {
    if (!confirm('¿Quitar esta relación? El paciente volverá a facturarse a su propio nombre.')) return;
    await api(`/api/relacionados/${id}`, { method: 'DELETE' });
    cargar();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><Link2 size={18} /></span>
            Relacionados
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pacientes que se facturan bajo el nombre de otro cliente de QuickBooks (ej. dependientes de una cuenta familiar).
          </p>
        </div>
        <Button variant="primary" size="md" onClick={() => setModalAbierto(true)}>
          <Plus size={15} />
          Relacionar paciente
        </Button>
      </div>

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <div className="flex-1 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : relaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <UserCheck size={32} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Sin pacientes relacionados todavía.</p>
            <Button variant="secondary" size="sm" onClick={() => setModalAbierto(true)} className="mt-1">
              <Plus size={14} />
              Relacionar el primero
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.72rem] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">Paciente (Dentalink)</th>
                  <th className="px-5 py-3 font-semibold">Se factura bajo</th>
                  <th className="px-5 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {relaciones.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {r.nombre_paciente || `Paciente #${r.id_paciente_dentalink}`}
                      <span className="ml-1.5 text-[0.75rem] font-normal text-slate-400">#{r.id_paciente_dentalink}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.qb_display_name}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => quitar(r.id)}
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

      <NuevoRelacionModal open={modalAbierto} onClose={() => setModalAbierto(false)} onCreada={cargar} />
    </div>
  );
}
