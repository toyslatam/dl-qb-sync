import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

export default function SyncPanel() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [idPaciente, setIdPaciente] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSync() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ desde: desde || undefined, hasta: hasta || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error desconocido');
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleSyncPaciente() {
    if (!idPaciente.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch(`/api/sync/paciente/${idPaciente}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Error desconocido');
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <h2>Sincronizar facturas</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label>
          Desde{' '}
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label>
          Hasta{' '}
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button onClick={handleSync} disabled={running}>
          {running ? 'Sincronizando…' : 'Sincronizar por rango'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label>
          Probar con un solo paciente (id_paciente){' '}
          <input value={idPaciente} onChange={(e) => setIdPaciente(e.target.value)} style={{ width: 100 }} />
        </label>
        <button onClick={handleSyncPaciente} disabled={running}>
          {running ? 'Procesando…' : 'Sincronizar este paciente'}
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <ul>
          <li>Facturas creadas: {result.creadas}</li>
          <li>Ya sincronizadas (omitidas): {result.yaSincronizadas}</li>
          <li>En cola de revisión: {result.enCola}</li>
          {result.customerStats && (
            <li>
              Clientes indexados: {result.customerStats.indexed}/{result.customerStats.total}
            </li>
          )}
          {result.itemStats && (
            <li>
              Items indexados: {result.itemStats.indexed}/{result.itemStats.total}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
