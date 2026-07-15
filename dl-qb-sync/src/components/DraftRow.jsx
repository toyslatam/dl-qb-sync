import { useState } from 'react';
import { apiFetch } from '../lib/api.js';
import SearchPicker from './SearchPicker.jsx';
import QboSelect from './QboSelect.jsx';

const ESTADO_BADGE = {
  matched: { label: 'ok', className: 'badge-success' },
  necesita_item: { label: 'falta item QuickBooks', className: 'badge-warning' },
  necesita_precio: { label: 'falta precio', className: 'badge-warning' },
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
  const [itemEditorFor, setItemEditorFor] = useState(null); // idDetalle cuyo item se esta asignando/cambiando
  const [registrarPago, setRegistrarPago] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const idPago = row.id_pago;
  const lista = draft.lineas.length > 0 && draft.lineas.every((l) => l.estado === 'matched') && draft.customerMatch;
  const totalFactura = draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);

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

  async function asignarItem(idDetalle, item) {
    const result = await run(() =>
      api(`/api/review-queue/${idPago}/lineas/${idDetalle}/asignar-item`, {
        method: 'POST',
        body: JSON.stringify({ qbItemId: item.Id, qbItemName: item.Name }),
      })
    );
    if (result) setItemEditorFor(null);
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
      setItemEditorFor(null);
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

  function actualizarFactura(campo, valor) {
    return run(() =>
      api(`/api/review-queue/${idPago}/factura`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  function actualizarDeposito(campo, valor) {
    return run(() =>
      api(`/api/review-queue/${idPago}/deposito`, {
        method: 'PATCH',
        body: JSON.stringify({ [campo]: valor }),
      })
    );
  }

  async function crearFacturaConfirmada() {
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
      setConfirmando(false);
    }
  }

  return (
    <div className="draft-card">
      <div className="draft-header">
        <strong>
          Pago #{idPago} · Paciente {draft.idPaciente} · ${draft.pago.monto} · {draft.pago.fecha}
        </strong>
        <span className={`badge ${lista ? 'badge-success' : 'badge-pending'}`}>
          {lista ? '✅ listo para crear' : '⏳ pendiente'}
        </span>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <span className="section-label" style={{ marginBottom: 'var(--space-1)' }}>
          Cliente en QuickBooks
        </span>
        {draft.customerMatch ? (
          <span style={{ fontWeight: 600 }}>{draft.customerMatch.qbDisplayName || `(id ${draft.customerMatch.qbCustomerId})`}</span>
        ) : (
          <div className="row">
            <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              sin asignar
            </span>
            <SearchPicker endpoint="/api/qbo/customers/buscar" labelKey="DisplayName" onPick={asignarCliente} placeholder="Buscar cliente…" />
            <span className="text-muted">o</span>
            <input
              placeholder="Nombre para crear cliente nuevo"
              value={creatingCustomerName}
              onChange={(e) => setCreatingCustomerName(e.target.value)}
              style={{ width: '100%', maxWidth: 220 }}
            />
            <button onClick={crearCliente} disabled={busy}>
              Crear en QuickBooks
            </button>
          </div>
        )}
      </div>

      <span className="section-label">Prestaciones</span>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Prestación</th>
              <th>Precio</th>
              <th>Cant.</th>
              <th>Estado</th>
              <th>Item QuickBooks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {draft.lineas.map((linea) => {
              const badge = ESTADO_BADGE[linea.estado] || { label: linea.estado, className: 'badge-pending' };
              const editandoItem = itemEditorFor === linea.idDetalle;
              return (
                <tr key={linea.idDetalle}>
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
                  <td>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td>
                    {editandoItem ? (
                      <ItemEditor
                        nombreSugerido={linea.nombre}
                        busy={busy}
                        onAsignar={(item) => asignarItem(linea.idDetalle, item)}
                        onCrear={(nombre) => crearItem(linea.idDetalle, nombre)}
                        onCancel={() => setItemEditorFor(null)}
                      />
                    ) : linea.qbItemId ? (
                      <span className="row" style={{ gap: 'var(--space-1)' }}>
                        <code>{linea.qbItemName || linea.qbItemId}</code>
                        <button className="btn-icon" onClick={() => setItemEditorFor(linea.idDetalle)}>
                          cambiar
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setItemEditorFor(linea.idDetalle)}>Asignar item</button>
                    )}
                  </td>
                  <td>
                    <button className="btn-icon" onClick={() => eliminarLinea(linea.idDetalle)} disabled={busy} title="Eliminar línea">
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="new-line-form">
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

      {error && <p className="text-danger">{error}</p>}
      {info && <p className="text-success">{info}</p>}

      <details className="preview-box">
        <summary>Detalles de factura</summary>
        <div className="stack" style={{ marginTop: 'var(--space-3)' }}>
          <div className="field-grid">
            <label className="field-label">
              N.° de factura
              <input value={draft.factura?.docNumber ?? ''} onChange={(e) => actualizarFactura('docNumber', e.target.value)} />
            </label>
            <label className="field-label">
              Términos
              <QboSelect
                endpoint="/api/qbo/terminos"
                value={draft.factura?.termRef}
                onChange={(v) => actualizarFactura('termRef', v)}
                placeholder="(sin término)"
              />
            </label>
            <label className="field-label">
              Fecha de factura
              <input type="date" value={draft.factura?.txnDate ?? ''} onChange={(e) => actualizarFactura('txnDate', e.target.value)} />
            </label>
            <label className="field-label">
              Fecha de vencimiento
              <input type="date" value={draft.factura?.dueDate ?? ''} onChange={(e) => actualizarFactura('dueDate', e.target.value)} />
            </label>
          </div>
          <label className="field-label">
            Nota para el cliente
            <input value={draft.factura?.customerMemo ?? ''} onChange={(e) => actualizarFactura('customerMemo', e.target.value)} />
          </label>
        </div>
      </details>

      <FacturaPreview draft={draft} />

      <div className="stack" style={{ marginTop: 'var(--space-2)' }}>
        <label className="row" style={{ gap: 'var(--space-1)' }}>
          <input type="checkbox" checked={registrarPago} onChange={(e) => setRegistrarPago(e.target.checked)} />
          Registrar pago/depósito al crear (deja la factura cerrada)
        </label>

        {registrarPago && (
          <div className="preview-box">
            <span className="section-label">Depósito a registrar</span>
            <div className="field-grid">
            <label className="field-label">
              Monto del depósito
              <input value={totalFactura.toFixed(2)} disabled title="Siempre es el total de la factura" />
            </label>
            <label className="field-label">
              Método de pago
              <QboSelect
                endpoint="/api/qbo/metodos-pago"
                value={draft.deposito?.metodoPagoRef}
                onChange={(v) => actualizarDeposito('metodoPagoRef', v)}
                placeholder="(opcional)"
              />
            </label>
            <label className="field-label">
              N.° de referencia
              <input
                value={draft.deposito?.numeroReferencia ?? ''}
                onChange={(e) => actualizarDeposito('numeroReferencia', e.target.value)}
              />
            </label>
            <label className="field-label">
              Depositar en
              <QboSelect
                endpoint="/api/qbo/cuentas-deposito"
                value={draft.deposito?.depositarEnRef}
                onChange={(v) => actualizarDeposito('depositarEnRef', v)}
                placeholder="(sin cuenta)"
              />
            </label>
            </div>
          </div>
        )}
      </div>

      {!confirmando ? (
        <button
          className="btn-primary"
          onClick={() => setConfirmando(true)}
          disabled={!lista || busy}
          style={{ marginTop: 'var(--space-2)' }}
        >
          {registrarPago ? 'Crear factura y registrar pago' : 'Crear factura en QuickBooks'}
        </button>
      ) : (
        <div
          className="preview-box"
          style={{ marginTop: 'var(--space-2)', borderLeftColor: 'var(--color-warning)', background: 'var(--color-warning-bg)' }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>
            Vas a crear en QuickBooks una factura de <strong>${totalFactura.toFixed(2)}</strong> a nombre de{' '}
            <strong>{draft.customerMatch?.qbDisplayName || `cliente ${draft.customerMatch?.qbCustomerId}`}</strong>
            {registrarPago ? ' y se registrará el pago de inmediato.' : '.'}
          </p>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Revisa que el monto coincida con el pago (${draft.pago.monto}) antes de confirmar. Esta acción no se puede deshacer desde la app.
          </p>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button className="btn-primary" onClick={crearFacturaConfirmada} disabled={busy}>
              {busy ? 'Creando en QuickBooks…' : `Sí, crear factura por $${totalFactura.toFixed(2)}`}
            </button>
            <button onClick={() => setConfirmando(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Buscar un Item existente o crear uno nuevo, para asignar/cambiar la linea. */
function ItemEditor({ nombreSugerido, busy, onAsignar, onCrear, onCancel }) {
  const [modo, setModo] = useState('buscar'); // 'buscar' | 'crear'
  const [nombre, setNombre] = useState(nombreSugerido);

  return (
    <div className="stack" style={{ minWidth: 220 }}>
      <div className="row">
        <button className={modo === 'buscar' ? 'btn-primary' : ''} onClick={() => setModo('buscar')}>
          Buscar existente
        </button>
        <button className={modo === 'crear' ? 'btn-primary' : ''} onClick={() => setModo('crear')}>
          Crear nuevo
        </button>
        <button className="btn-icon" onClick={onCancel} disabled={busy}>
          ✕
        </button>
      </div>
      {modo === 'buscar' ? (
        <SearchPicker endpoint="/api/qbo/items/buscar" labelKey="Name" onPick={onAsignar} placeholder="Buscar item…" />
      ) : (
        <div className="row">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: 180 }} />
          <button className="btn-primary" onClick={() => onCrear(nombre)} disabled={busy || !nombre.trim()}>
            Crear en QuickBooks
          </button>
        </div>
      )}
    </div>
  );
}

/** Muestra como quedaria la factura en QuickBooks antes de crearla. */
function FacturaPreview({ draft }) {
  const total = draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);

  return (
    <div className="preview-box">
      <span className="section-label">Vista previa de la factura</span>
      <table className="data-table" style={{ minWidth: 'auto' }}>
        <tbody>
          <tr>
            <td className="text-muted">Cliente</td>
            <td>{draft.customerMatch?.qbDisplayName || draft.customerMatch?.qbCustomerId || '(sin asignar)'}</td>
          </tr>
          <tr>
            <td className="text-muted">N° documento</td>
            <td>{draft.factura?.docNumber ?? draft.pago.folioBoleta ?? draft.pago.id}</td>
          </tr>
          <tr>
            <td className="text-muted">Fecha</td>
            <td>{draft.factura?.txnDate ?? draft.pago.fecha}</td>
          </tr>
          {draft.factura?.dueDate && (
            <tr>
              <td className="text-muted">Vencimiento</td>
              <td>{draft.factura.dueDate}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="table-wrap" style={{ marginTop: 'var(--space-2)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Cant.</th>
              <th>Precio unit.</th>
              <th>Importe</th>
            </tr>
          </thead>
          <tbody>
            {draft.lineas.map((l) => (
              <tr key={l.idDetalle}>
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
