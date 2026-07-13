import { getPagos, getPagosByPaciente, getTratamientosByPaciente, getDetalleTratamiento } from '../integrations/dentalink.js';
import { createInvoice } from '../integrations/quickbooks.js';
import { refreshCustomerIndex, matchCustomer } from '../matching/customerMatch.js';
import { refreshItemIndex, matchItem, normalizeKey } from '../matching/itemMatch.js';
import { isInvoiceSynced, markInvoiceSynced, upsertDraft, getPendingDrafts, resolveReviewItem } from '../db/store.js';

// Mapeo de medio_pago (Dentalink) -> PaymentMethodRef (QuickBooks), igual al
// que ya se usaba en el flujo de Power Automate para esta misma empresa.
const PAYMENT_METHOD_IDS = {
  Efectivo: '2',
  'Tarjeta de crédito (Visa o Master Card)': '4',
  'Transferencia electrónica (ACH)': '5',
  'Yappy - Banco General': '1000000001',
};

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
  const customerMatch = await matchCustomer(idPaciente);
  const docNumber = pago.folio ?? pago.id;
  // La factura se registra el dia que se crea en QuickBooks, no el dia
  // historico del pago en Dentalink (que puede ser mucho mas antiguo).
  const hoy = new Date().toISOString().slice(0, 10);

  return {
    idPaciente: String(idPaciente),
    pago: {
      id: pago.id,
      monto: pago.monto_pago,
      fecha: pago.fecha_recepcion,
      folioBoleta: pago.folio ?? null,
      medioPago: pago.medio_pago ?? null,
      referencia: pago.numero_referencia ?? null,
    },
    customerMatch,
    lineas,
    // Datos de encabezado de la factura, editables antes de crearla.
    factura: {
      docNumber,
      trackingNum: docNumber,
      txnDate: hoy,
      dueDate: hoy,
      termRef: process.env.QBO_SALES_TERM_ID || null,
      customerMemo: pago.numero_referencia ?? '',
      taxCodeRef: process.env.QBO_TAX_CODE_ID || null,
    },
    // Datos del deposito/pago que se registra al mismo tiempo que la factura.
    deposito: {
      monto: pago.monto_pago,
      metodoPagoRef: PAYMENT_METHOD_IDS[pago.medio_pago] ?? null,
      depositarEnRef: process.env.QBO_DEPOSIT_ACCOUNT_ID || null,
      numeroReferencia: pago.numero_referencia ?? '',
    },
  };
}

export function calcularTotal(draft) {
  return draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);
}

export function isDraftReady(draft) {
  return Boolean(draft.customerMatch?.qbCustomerId) && draft.lineas.length > 0 && draft.lineas.every((l) => l.estado === 'matched');
}

export function invoicePayloadFromDraft(draft) {
  const f = draft.factura ?? {};
  const payload = {
    CustomerRef: { value: draft.customerMatch.qbCustomerId },
    TxnDate: f.txnDate || draft.pago.fecha,
    DocNumber: String(f.docNumber ?? draft.pago.folioBoleta ?? draft.pago.id),
    TrackingNum: String(f.trackingNum ?? draft.pago.folioBoleta ?? draft.pago.id),
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
  if (f.dueDate) payload.DueDate = f.dueDate;
  if (f.customerMemo) payload.CustomerMemo = { value: f.customerMemo };
  if (f.termRef) payload.SalesTermRef = { value: String(f.termRef) };
  if (f.taxCodeRef) payload.TxnTaxDetail = { TxnTaxCodeRef: { value: String(f.taxCodeRef) } };
  return payload;
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

/**
 * Crea en QuickBooks la factura de un borrador ya resuelto en la cola de
 * revision. Si registrarPago es true, se incluye el campo Deposit (y su
 * cuenta/metodo de pago) directo en la factura, que es como QuickBooks
 * registra el pago al mismo tiempo que crea el documento (sin necesidad de
 * un Payment aparte).
 */
export async function createInvoiceFromQueue(idPago, { registrarPago = false } = {}) {
  const drafts = await getPendingDrafts();
  const row = drafts.find((d) => d.id_pago === String(idPago));
  if (!row) throw new Error(`No hay borrador pendiente para el pago ${idPago}`);
  if (!isDraftReady(row.draft)) throw new Error('El borrador aun tiene lineas o cliente sin resolver');

  const payload = invoicePayloadFromDraft(row.draft);
  if (registrarPago) {
    const d = row.draft.deposito ?? {};
    // El deposito siempre es por el total real de la factura (suma de lineas),
    // no el monto original del pago en Dentalink, que puede no coincidir si
    // se editaron/agregaron/quitaron lineas en la cola de revision.
    payload.Deposit = calcularTotal(row.draft);
    if (d.depositarEnRef) payload.DepositToAccountRef = { value: String(d.depositarEnRef) };
    if (d.metodoPagoRef) payload.PaymentMethodRef = { value: String(d.metodoPagoRef) };
  }

  const created = await createInvoice(payload);
  await markInvoiceSynced(idPago, created.Invoice.Id);
  await resolveReviewItem(idPago);
  return { invoice: created };
}
