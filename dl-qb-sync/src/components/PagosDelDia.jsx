import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

const ESTADO_BADGE = {
  sincronizado: { label: 'sincronizado', className: 'badge-success' },
  en_cola: { label: 'en cola de revisión', className: 'badge-warning' },
  pendiente: { label: 'pendiente', className: 'badge-pending' },
};

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function PagosDelDia({ onTraido }) {
  const [fecha, setFecha] = useState(hoy());
  const [pagos, setPagos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(null); // id_pago en proceso

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/pagos?desde=${fecha}&hasta=${fecha}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Error desconocido');
      setPagos(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function traerDetalle(idPago) {
    setProcesando(idPago);
    setError(null);
    try {
      const res = await apiFetch(`/api/pagos/${idPago}/traer-detalle`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      await buscar();
      onTraido?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <section className="card">
      <h2>Pagos del día</h2>
      <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
        <label className="field-label">
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <button className="btn-primary" onClick={buscar} disabled={loading} style={{ alignSelf: 'flex-end' }}>
          {loading ? 'Buscando…' : 'Buscar pagos'}
        </button>
      </div>

      {error && <p className="text-danger">{error}</p>}

      {pagos && pagos.length === 0 && <p className="text-muted">Sin pagos para esa fecha.</p>}

      {pagos && pagos.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th># Pago</th>
                <th>Paciente</th>
                <th>Medio de pago</th>
                <th># Boleta</th>
                <th>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => {
                const badge = ESTADO_BADGE[p.estado] || { label: p.estado, className: 'badge-pending' };
                return (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>
                      {p.nombrePaciente || `#${p.idPaciente}`}
                    </td>
                    <td>{p.medioPago ?? '—'}</td>
                    <td>{p.folio ?? '—'}</td>
                    <td>${p.monto}</td>
                    <td>
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td>
                      <button onClick={() => traerDetalle(p.id)} disabled={p.estado === 'sincronizado' || procesando === p.id}>
                        {procesando === p.id ? 'Trayendo…' : p.estado === 'en_cola' ? 'Actualizar detalle' : 'Traer detalle'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
