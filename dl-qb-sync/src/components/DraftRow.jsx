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
  const [nuevaLinea, setNuevaLinea] = useState({ nombre: '', precio: '', cantidad: 1 });
  const [creatingItemFor, setCreatingItemFor] = useState(null); // idDetalle en edicion
  const [registrarPago, setRegistrarPago] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const idPago = row.id_pago;
  const lista = draft.lineas.length > 0 && draft.lineas.every((l) => l.estado === 'matched') && draft.customerMatch;

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated?.lineas) setDraft(updated);
      return updated;
    } catch (err) {
      setError(err.message);
      return null;
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

  async function crearItem(idDetalle, nombreSugerido) {
    setInfo(null);
    const result = await run(() =>
      api(`/api/review-queue/${idPago}/lineas/${idDetalle}/crear-item`, {
        method: 'POST',
        body: JSON.stringify({ nombre: nombreSugerido }),
      })
    );
    if (result) {
      setDraft(result.draft);
      setInfo(`Item creado en QuickBooks (cuenta de ingreso: ${result.cuentaIngresoUsada})`);
      setCreatingItemFor(null);
    }
  }

  function editarLinea(idDetalle, campo, valor) {
    return run(() =>
      api(`/api/review-queue/${idPago}/lineas/${idDetalle}`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  function eliminarLinea(idDetalle) {
    return run(() => api(`/api/review-queue/${idPago}/lineas/${idDetalle}`, { method: 'DELETE' }));
  }

  async function agregarLinea() {
    if (!nuevaLinea.nombre.trim()) return;
    const result = await run(() =>
      api(`/api/review-queue/${idPago}/lineas`, {
        method: 'POST',
        body: JSON.stringify(nuevaLinea),
      })
    );
    if (result) setNuevaLinea({ nombre: '', precio: '', cantidad: 1 });
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
      await api(`/api/review-queue/${idPago}/crear-factura`, {
        method: 'POST',
        body: JSON.stringify({ registrarPago }),
      });
      onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'space-between' }}>
        <strong>
          Pago #{idPago} · Paciente {draft.idPaciente} · ${draft.pago.monto} · {draft.pago.fecha}
        </strong>
        <span>{lista ? '✅ listo para crear' : '⏳ pendiente'}</span>
      </div>

      <div style={{ margin: '0.5rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
        <b>Cliente en QuickBooks: </b>
        {draft.customerMatch ? (
          <span>{draft.customerMatch.qbDisplayName || `(id ${draft.customerMatch.qbCustomerId})`}</span>
        ) : (
          <>
            <span style={{ color: 'crimson' }}>sin asignar</span>
            <SearchPicker endpoint="/api/qbo/customers/buscar" labelKey="DisplayName" onPick={asignarCliente} placeholder="Buscar cliente…" />
            <span>o</span>
            <input
              placeholder="Nombre para crear cliente nuevo"
              value={creatingCustomerName}
              onChange={(e) => setCreatingCustomerName(e.target.value)}
              style={{ width: '100%', maxWidth: 220 }}
            />
            <button onClick={crearCliente} disabled={busy}>
              Crear en QuickBooks
            </button>
          </>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
              <th>Prestación</th>
              <th>Precio</th>
              <th>Cant.</th>
              <th>Estado</th>
              <th>Item QuickBooks</th>
              <th></th>
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
                  ) : creatingItemFor === linea.idDetalle ? (
                    <CrearItemInline
                      nombreInicial={linea.nombre}
                      busy={busy}
                      onCancel={() => setCreatingItemFor(null)}
                      onCrear={(nombre) => crearItem(linea.idDetalle, nombre)}
                    />
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
                      <SearchPicker
                        endpoint="/api/qbo/items/buscar"
                        labelKey="Name"
                        onPick={(item) => asignarItem(linea.idDetalle, item)}
                        placeholder="Buscar item…"
                      />
                      <button onClick={() => setCreatingItemFor(linea.idDetalle)}>+ nuevo item</button>
                    </div>
                  )}
                </td>
                <td>
                  <button onClick={() => eliminarLinea(linea.idDetalle)} disabled={busy} title="Eliminar linea">
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <input
          placeholder="Nombre de la línea"
          value={nuevaLinea.nombre}
          onChange={(e) => setNuevaLinea({ ...nuevaLinea, nombre: e.target.value })}
          style={{ width: 180 }}
        />
        <input
          type="number"
          placeholder="Precio"
          value={nuevaLinea.precio}
          onChange={(e) => setNuevaLinea({ ...nuevaLinea, precio: e.target.value })}
          style={{ width: 90 }}
        />
        <input
          type="number"
          placeholder="Cant."
          value={nuevaLinea.cantidad}
          onChange={(e) => setNuevaLinea({ ...nuevaLinea, cantidad: e.target.value })}
          style={{ width: 60 }}
        />
        <button onClick={agregarLinea} disabled={busy}>
          + Agregar línea
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {info && <p style={{ color: 'green' }}>{info}</p>}

      <FacturaPreview draft={draft} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <label>
          <input type="checkbox" checked={registrarPago} onChange={(e) => setRegistrarPago(e.target.checked)} />{' '}
          Registrar pago/depósito al crear (deja la factura cerrada)
        </label>
      </div>

      <button onClick={crearFactura} disabled={!lista || busy} style={{ marginTop: '0.5rem' }}>
        {busy ? 'Creando…' : registrarPago ? 'Crear factura y registrar pago' : 'Crear factura en QuickBooks'}
      </button>
    </div>
  );
}

/** Formulario chico para crear un Item nuevo en QuickBooks al vuelo. */
function CrearItemInline({ nombreInicial, busy, onCancel, onCrear }) {
  const [nombre, setNombre] = useState(nombreInicial);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: 180 }} />
      <button onClick={() => onCrear(nombre)} disabled={busy || !nombre.trim()}>
        Crear en QuickBooks
      </button>
      <button onClick={onCancel} disabled={busy}>
        Cancelar
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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem', minWidth: 420 }}>
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
    </div>
  );
}
