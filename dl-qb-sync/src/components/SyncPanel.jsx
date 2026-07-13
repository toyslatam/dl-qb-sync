import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

export default function SyncPanel({ onSynced }) {
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
      onSynced?.();
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
      onSynced?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card">
      <h2>Sincronizar facturas</h2>
      <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="field-label">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="field-label">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={handleSync} disabled={running} style={{ alignSelf: 'flex-end' }}>
          {running ? 'Sincronizando…' : 'Sincronizar por rango'}
        </button>
      </div>

      <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
        <label className="field-label">
          Probar con un solo paciente (id_paciente)
          <input value={idPaciente} onChange={(e) => setIdPaciente(e.target.value)} style={{ width: 120 }} />
        </label>
        <button onClick={handleSyncPaciente} disabled={running} style={{ alignSelf: 'flex-end' }}>
          {running ? 'Procesando…' : 'Sincronizar este paciente'}
        </button>
      </div>

      {error && <p className="text-danger">{error}</p>}
      {result && (
        <div className="table-wrap" style={{ marginTop: 'var(--space-3)' }}>
          <table className="data-table" style={{ minWidth: 'auto' }}>
            <tbody>
              <tr>
                <td>Facturas creadas</td>
                <td>
                  <span className="badge badge-success">{result.creadas}</span>
                </td>
              </tr>
              <tr>
                <td>Ya sincronizadas (omitidas)</td>
                <td>{result.yaSincronizadas}</td>
              </tr>
              <tr>
                <td>En cola de revisión</td>
                <td>
                  <span className="badge badge-warning">{result.enCola}</span>
                </td>
              </tr>
              {result.customerStats && (
                <tr>
                  <td>Clientes indexados</td>
                  <td>
                    {result.customerStats.indexed}/{result.customerStats.total}
                  </td>
                </tr>
              )}
              {result.itemStats && (
                <tr>
                  <td>Items indexados</td>
                  <td>
                    {result.itemStats.indexed}/{result.itemStats.total}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
