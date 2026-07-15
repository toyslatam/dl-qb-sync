import { useState } from 'react';
import { apiFetch } from '../lib/api.js';

const ESTADO_BADGE = {
  sincronizado: { label: 'sincronizado', className: 'badge-success' },
  en_cola: { label: 'en cola de revisión', className: 'badge-warning' },
  pendiente: { label: 'pendiente', className: 'badge-pending' },
};

/** Fecha de hoy en la zona horaria local del navegador (no UTC: toISOString() se adelanta
 * un dia despues de las 7pm en Panama/Colombia, que estan en UTC-5). */
function hoy() {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
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

  async function cambiarEstado(idPago, aRegistrado) {
    setProcesando(idPago);
    setError(null);
    try {
      const ruta = aRegistrado ? 'marcar-registrado' : 'marcar-pendiente';
      const res = await apiFetch(`/api/pagos/${idPago}/${ruta}`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Error desconocido');
      await buscar();
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

      {pagos && pagos.length === 0 && <p className="empty-state">Sin pagos para esa fecha.</p>}

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
                      <div className="row" style={{ gap: 'var(--space-1)', flexWrap: 'nowrap' }}>
                        <button onClick={() => traerDetalle(p.id)} disabled={p.estado === 'sincronizado' || procesando === p.id}>
                          {procesando === p.id ? 'Trayendo…' : p.estado === 'en_cola' ? 'Actualizar' : 'Traer detalle'}
                        </button>
                        {p.estado === 'sincronizado' ? (
                          <button className="btn-icon" onClick={() => cambiarEstado(p.id, false)} disabled={procesando === p.id} title="Marcar como pendiente">
                            ↩︎
                          </button>
                        ) : (
                          <button className="btn-icon" onClick={() => cambiarEstado(p.id, true)} disabled={procesando === p.id} title="Marcar como ya registrado en QuickBooks">
                            ✓
                          </button>
                        )}
                      </div>
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
