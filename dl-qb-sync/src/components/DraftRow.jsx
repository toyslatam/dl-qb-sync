import { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import SearchPicker from './SearchPicker.jsx';

const ESTADO_LABELS = {
  matched: '✅ ok',
  necesita_item: '⚠️ falta item QuickBooks',
  necesita_precio: '⚠️ falta precio',
};

async function api(path, options) {
  const res = await apiFetch(path, options);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Error');
  return body;
}

export default function DraftRow({ row, onChange }) {
  const [draft, setDraft] = useState(row.draft);
  const [creatingCustomerName, setCreatingCustomerName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const idPago = row.id_pago;
  const lista = draft.lineas.every((l) => l.estado === 'matched') && draft.customerMatch;

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated?.lineas) setDraft(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function asignarItem(idDetalle, item) {
    return run(() =>
      api(`/api/review-queue/${idPago}/lineas/${idDetalle}/asignar-item`, {
        method: 'POST',
        body: JSON.stringify({ qbItemId: item.Id, qbItemName: item.Name }),
      })
    );
  }

  function editarLinea(idDetalle, campo, valor) {
    return run(() =>
      api(`/api/review-queue/${idPago}/lineas/${idDetalle}`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  function asignarCliente(customer) {
    return run(() =>
      api(`/api/review-queue/${idPago}/asignar-cliente`, {
        method: 'POST',
        body: JSON.stringify({ qbCustomerId: customer.Id, qbDisplayName: customer.DisplayName }),
      })
    );
  }

  async function crearCliente() {
    if (!creatingCustomerName.trim()) return;
    await run(() =>
      api(`/api/review-queue/${idPago}/crear-cliente`, {
        method: 'POST',
        body: JSON.stringify({ nombre: creatingCustomerName }),
      })
    );
  }

  async function crearFactura() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/review-queue/${idPago}/crear-factura`, { method: 'POST' });
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>
          Pago #{idPago} · Paciente {draft.idPaciente} · ${draft.pago.monto} · {draft.pago.fecha}
        </strong>
        <span>{lista ? '✅ listo para crear' : '⏳ pendiente'}</span>
      </div>

      <div style={{ margin: '0.5rem 0' }}>
        <b>Cliente en QuickBooks: </b>
        {draft.customerMatch ? (
          <span>
            {draft.customerMatch.qbDisplayName || `(id ${draft.customerMatch.qbCustomerId})`}
          </span>
        ) : (
          <>
            <span style={{ color: 'crimson' }}>sin asignar</span>{' '}
            <SearchPicker endpoint="/api/qbo/customers/buscar" labelKey="DisplayName" onPick={asignarCliente} placeholder="Buscar cliente…" />
            <div style={{ marginTop: '0.25rem' }}>
              o{' '}
              <input
                placeholder="Nombre para crear cliente nuevo"
                value={creatingCustomerName}
                onChange={(e) => setCreatingCustomerName(e.target.value)}
                style={{ width: 200 }}
              />
              <button onClick={crearCliente} disabled={busy}>
                Crear en QuickBooks
              </button>
            </div>
          </>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Prestación</th>
            <th>Precio</th>
            <th>Cant.</th>
            <th>Estado</th>
            <th>Item QuickBooks</th>
          </tr>
        </thead>
        <tbody>
          {draft.lineas.map((linea) => (
            <tr key={linea.idDetalle} style={{ borderBottom: '1px solid #eee' }}>
              <td>{linea.nombre}</td>
              <td>
                <input
                  type="number"
                  value={linea.precio ?? ''}
                  style={{ width: 90 }}
                  onChange={(e) => editarLinea(linea.idDetalle, 'precio', e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={linea.cantidad ?? 1}
                  style={{ width: 50 }}
                  onChange={(e) => editarLinea(linea.idDetalle, 'cantidad', e.target.value)}
                />
              </td>
              <td>{ESTADO_LABELS[linea.estado] || linea.estado}</td>
              <td>
                {linea.qbItemId ? (
                  <code>{linea.qbItemName || linea.qbItemId}</code>
                ) : (
                  <SearchPicker
                    endpoint="/api/qbo/items/buscar"
                    labelKey="Name"
                    onPick={(item) => asignarItem(linea.idDetalle, item)}
                    placeholder="Buscar item…"
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <FacturaPreview draft={draft} />

      <button onClick={crearFactura} disabled={!lista || busy} style={{ marginTop: '0.5rem' }}>
        {busy ? 'Creando…' : 'Crear factura en QuickBooks'}
      </button>
    </div>
  );
}

/** Muestra como quedaria la factura en QuickBooks antes de crearla. */
function FacturaPreview({ draft }) {
  const total = draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);

  return (
    <div style={{ background: '#f7f7f7', border: '1px dashed #bbb', borderRadius: 6, padding: '0.75rem', margin: '0.75rem 0' }}>
      <b>Vista previa de la factura</b>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.4rem' }}>
        <tbody>
          <tr>
            <td style={{ color: '#666' }}>Cliente</td>
            <td>{draft.customerMatch?.qbDisplayName || draft.customerMatch?.qbCustomerId || '(sin asignar)'}</td>
          </tr>
          <tr>
            <td style={{ color: '#666' }}>N° documento</td>
            <td>{draft.pago.folioBoleta ?? draft.pago.id}</td>
          </tr>
          <tr>
            <td style={{ color: '#666' }}>Fecha</td>
            <td>{draft.pago.fecha}</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Item</th>
            <th>Cant.</th>
            <th>Precio unit.</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {draft.lineas.map((l) => (
            <tr key={l.idDetalle} style={{ borderBottom: '1px solid #eee' }}>
              <td>{l.qbItemName || l.nombre}</td>
              <td>{l.cantidad ?? 1}</td>
              <td>{l.precio ?? '—'}</td>
              <td>{l.precio !== null ? (l.precio * (l.cantidad ?? 1)).toFixed(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>
              Total
            </td>
            <td style={{ fontWeight: 'bold' }}>{total.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
