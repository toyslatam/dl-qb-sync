import { getPagos, getPagosByPaciente, getTratamientosByPaciente, getDetalleTratamiento } from '../integrations/dentalink.js';
import { createInvoice } from '../integrations/quickbooks.js';
import { refreshCustomerIndex, matchCustomer } from '../matching/customerMatch.js';
import { refreshItemIndex, matchItem, normalizeKey } from '../matching/itemMatch.js';
import { isInvoiceSynced, markInvoiceSynced, upsertDraft, getPendingDrafts, resolveReviewItem } from '../db/store.js';

/**
 * Junta las lineas (prestaciones) de todos los tratamientos vigentes de un
 * paciente. Como el vinculo exacto pago -> detalle no esta confirmado en la
 * documentacion, se listan todas las prestaciones de sus tratamientos y el
 * humano confirma/edita cuales corresponden a este pago desde la cola de
 * revision antes de crear la factura.
 */
async function getLineasCandidatas(idPaciente) {
  const tratamientos = await getTratamientosByPaciente(idPaciente);
  const lineas = [];
  for (const tratamiento of tratamientos) {
    const detalles = await getDetalleTratamiento(tratamiento.id);
    for (const detalle of detalles) {
      const nombre = detalle.nombre_prestacion ?? detalle.nombre ?? null;
      const codigo = detalle.codigo_prestacion ?? detalle.codigo ?? null;
      const precio = detalle.precio ?? detalle.valor ?? null;
      const key = normalizeKey(codigo || nombre || `detalle-${detalle.id}`);

      const qbItemId = nombre || codigo ? await matchItem({ nombre, codigo }) : null;

      lineas.push({
        key,
        idTratamiento: tratamiento.id,
        idDetalle: detalle.id,
        nombre: nombre ?? '(sin nombre)',
        precio,
        cantidad: detalle.cantidad ?? 1,
        qbItemId: qbItemId ?? null,
        qbItemName: null,
        estado: !nombre ? 'necesita_item' : precio === null ? 'necesita_precio' : qbItemId ? 'matched' : 'necesita_item',
      });
    }
  }
  return lineas;
}

async function buildDraft(idPaciente, pago, lineas) {
  const qbCustomerId = await matchCustomer(idPaciente);
  return {
    idPaciente: String(idPaciente),
    pago: {
      id: pago.id,
      monto: pago.monto_pago,
      fecha: pago.fecha_recepcion,
      folioBoleta: pago.folio ?? null,
    },
    customerMatch: qbCustomerId ? { qbCustomerId } : null,
    lineas,
  };
}

export function isDraftReady(draft) {
  return Boolean(draft.customerMatch?.qbCustomerId) && draft.lineas.length > 0 && draft.lineas.every((l) => l.estado === 'matched');
}

export function invoicePayloadFromDraft(draft) {
  return {
    CustomerRef: { value: draft.customerMatch.qbCustomerId },
    TxnDate: draft.pago.fecha,
    DocNumber: String(draft.pago.folioBoleta ?? draft.pago.id),
    Line: draft.lineas.map((l) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: l.precio * (l.cantidad ?? 1),
      SalesItemLineDetail: {
        ItemRef: { value: l.qbItemId },
        Qty: l.cantidad ?? 1,
        UnitPrice: l.precio,
      },
    })),
  };
}

/**
 * Corre un ciclo de sincronizacion sobre un rango de fechas de pagos.
 * Refresca los indices de QuickBooks, arma un borrador de factura por cada
 * pago no sincronizado y crea directamente en QuickBooks los que ya matchean
 * 100% (cliente + todas las lineas); el resto queda en review_queue para
 * completar/editar manualmente desde la web.
 */
export async function runSyncCycle({ fechaDesde, fechaHasta } = {}) {
  const customerStats = await refreshCustomerIndex();
  const itemStats = await refreshItemIndex();

  const pagos = await getPagos({ fechaDesde, fechaHasta });
  const result = { creadas: 0, enCola: 0, yaSincronizadas: 0, customerStats, itemStats };

  for (const pago of pagos) {
    if (await isInvoiceSynced(pago.id)) {
      result.yaSincronizadas += 1;
      continue;
    }

    const lineas = await getLineasCandidatas(pago.id_paciente);
    const draft = await buildDraft(pago.id_paciente, pago, lineas);

    if (isDraftReady(draft)) {
      const created = await createInvoice(invoicePayloadFromDraft(draft));
      await markInvoiceSynced(pago.id, created.Invoice.Id);
      result.creadas += 1;
    } else {
      await upsertDraft(pago.id, pago.id_paciente, draft);
      result.enCola += 1;
    }
  }

  return result;
}

/** Corre el mismo flujo pero para un solo paciente (modo de prueba). */
export async function runSyncForPaciente(idPaciente) {
  await refreshCustomerIndex();
  await refreshItemIndex();

  const pagos = await getPagosByPaciente(idPaciente);
  const result = { creadas: 0, enCola: 0, yaSincronizadas: 0 };

  for (const pago of pagos) {
    if (await isInvoiceSynced(pago.id)) {
      result.yaSincronizadas += 1;
      continue;
    }
    const lineas = await getLineasCandidatas(idPaciente);
    const draft = await buildDraft(idPaciente, pago, lineas);

    if (isDraftReady(draft)) {
      const created = await createInvoice(invoicePayloadFromDraft(draft));
      await markInvoiceSynced(pago.id, created.Invoice.Id);
      result.creadas += 1;
    } else {
      await upsertDraft(pago.id, idPaciente, draft);
      result.enCola += 1;
    }
  }

  return result;
}

/** Crea en QuickBooks la factura de un borrador ya resuelto en la cola de revision. */
export async function createInvoiceFromQueue(idPago) {
  const drafts = await getPendingDrafts();
  const row = drafts.find((d) => d.id_pago === String(idPago));
  if (!row) throw new Error(`No hay borrador pendiente para el pago ${idPago}`);
  if (!isDraftReady(row.draft)) throw new Error('El borrador aun tiene lineas o cliente sin resolver');

  const created = await createInvoice(invoicePayloadFromDraft(row.draft));
  await markInvoiceSynced(idPago, created.Invoice.Id);
  await resolveReviewItem(idPago);
  return created;
}
