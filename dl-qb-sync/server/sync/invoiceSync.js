import { getPagos, getPagosByPaciente, getPagoPorId, getTratamientosByPaciente, getDetalleTratamiento } from '../integrations/dentalink.js';
import { createInvoice } from '../integrations/quickbooks.js';
import { refreshCustomerIndex, matchCustomer } from '../matching/customerMatch.js';
import { refreshItemIndex, matchItem, normalizeKey } from '../matching/itemMatch.js';
import { isInvoiceSynced, markInvoiceSynced, upsertDraft, getPendingDrafts, resolveReviewItem } from '../db/store.js';

// Mapeos identicos al flujo de Power Automate ya usado por esta empresa en QuickBooks.
const PAYMENT_METHOD_IDS = {
  Efectivo: '2',
  'Tarjeta de crédito (Visa o Master Card)': '4',
  'Transferencia electrónica (ACH)': '5',
  'Yappy - Banco General': '1000000001',
  'Tarjeta de débito (Clave)': '1000000011',
  'Tarjeta de crédito (Visa o MasterCard) a distancia': '1000000021',
};

// Cuenta de deposito por defecto segun el medio de pago (pedido explicito del
// cliente): tarjeta de credito y clave -> BAC, ACH y enlace de pago -> Banco
// General, efectivo -> Fondo sin Depositar. IDs reales de QuickBooks.
const BAC = '1150040001';
const BANCO_GENERAL = '1150040000';
const FONDO_SIN_DEPOSITAR = '1150040003';

const DEPOSIT_ACCOUNT_IDS = {
  Efectivo: FONDO_SIN_DEPOSITAR,
  'Tarjeta de crédito (Visa o Master Card)': BAC,
  'Tarjeta de débito (Clave)': BAC,
  'Transferencia electrónica (ACH)': BANCO_GENERAL,
  'Yappy - Banco General': BANCO_GENERAL,
  // "Enlace" de pago = cobro a distancia por link.
  'Tarjeta de crédito (Visa o MasterCard) a distancia': BANCO_GENERAL,
};

// Termino de venta por defecto: Due on receipt (Id real en QuickBooks).
const DEFAULT_TERM_ID = '2';

const TAX_CODE_ID = process.env.QBO_TAX_CODE_ID || '7';

/** Fecha de hoy en hora de Panama (UTC-5 fijo, sin horario de verano), sin importar la zona horaria del servidor. */
function hoyPanama() {
  const PANAMA_OFFSET_MS = -5 * 60 * 60 * 1000;
  return new Date(Date.now() + PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Junta las lineas (prestaciones) de todos los tratamientos vigentes de un
 * paciente. Como el vinculo exacto pago -> detalle no esta confirmado en la
 * documentacion, se listan las prestaciones de sus tratamientos y el humano
 * confirma/edita cuales corresponden a este pago desde la cola de revision
 * antes de crear la factura.
 *
 * Replica el mismo filtro que el flujo de Power Automate ya en uso: solo
 * detalles realizados el mismo dia del pago (fecha_realizacion), y se
 * descartan los de total 0 (ya cubiertos/descontados), para no meter en la
 * factura prestaciones de otras visitas o lineas sin monto real.
 */
async function getLineasCandidatas(idPaciente, fechaPago) {
  const tratamientos = await getTratamientosByPaciente(idPaciente);
  const lineas = [];
  for (const tratamiento of tratamientos) {
    const todosDetalles = await getDetalleTratamiento(tratamiento.id);
    const detalles = todosDetalles.filter((d) => {
      if (Number(d.total) === 0) return false;
      if (fechaPago && d.fecha_realizacion) return d.fecha_realizacion.slice(0, 10) === fechaPago.slice(0, 10);
      return true;
    });
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
  // N. de factura = numero de pago de Dentalink (pedido explicito del cliente).
  // El resto (tracking number, referencia del deposito) sigue usando la
  // boleta/folio, como siempre.
  const docNumber = pago.id;
  const boleta = pago.folio ?? pago.id;
  // La factura se registra el dia que se crea en QuickBooks (hora de Panama),
  // no el dia historico del pago en Dentalink (que puede ser mucho mas antiguo).
  const hoy = hoyPanama();

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
      trackingNum: boleta,
      txnDate: hoy,
      dueDate: hoy,
      termRef: process.env.QBO_SALES_TERM_ID || DEFAULT_TERM_ID,
      customerMemo: pago.numero_referencia ?? '',
      taxCodeRef: TAX_CODE_ID,
    },
    // Datos del deposito/pago que se registra al mismo tiempo que la factura.
    deposito: {
      monto: pago.monto_pago,
      metodoPagoRef: PAYMENT_METHOD_IDS[pago.medio_pago] ?? null,
      depositarEnRef: DEPOSIT_ACCOUNT_IDS[pago.medio_pago] ?? process.env.QBO_DEPOSIT_ACCOUNT_ID ?? null,
      // Referencia del deposito = boleta de Dentalink (folio), no el usuario que recibio el pago.
      numeroReferencia: String(boleta),
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
        ...(f.taxCodeRef ? { TaxCodeRef: { value: String(f.taxCodeRef) } } : {}),
      },
    })),
  };
  if (f.dueDate) payload.DueDate = f.dueDate;
  if (f.customerMemo) payload.CustomerMemo = { value: f.customerMemo };
  if (f.termRef) payload.SalesTermRef = { value: String(f.termRef) };
  if (f.taxCodeRef) payload.TxnTaxDetail = { TxnTaxCodeRef: { value: String(f.taxCodeRef) } };
  if (draft.pago.folioBoleta) payload.PaymentRefNum = String(draft.pago.folioBoleta);
  // Requerido por QuickBooks para empresas fuera de EE.UU. (segun documentacion
  // de Intuit). TaxExcluded (en vez de NotApplicable) hace que SI se muestre
  // la linea de impuesto en la factura (en 0%, via el TaxCodeRef Exempt), en
  // vez de omitir la seccion de impuesto por completo -- necesario para que
  // la factura muestre el ITBMS explicito para efectos fiscales/DGI.
  payload.GlobalTaxCalculation = 'TaxExcluded';
  return payload;
}

/**
 * Corre un ciclo de sincronizacion sobre un rango de fechas de pagos.
 * Refresca los indices de QuickBooks y arma un borrador de factura por cada
 * pago no sincronizado, dejandolo siempre en review_queue. La creacion en
 * QuickBooks NUNCA es automatica -- un humano debe confirmarla explicitamente
 * desde la web (aunque cliente y prestaciones ya matcheen 100%), para que no
 * se dispare una factura sin que nadie la revise primero.
 */
export async function runSyncCycle({ fechaDesde, fechaHasta } = {}) {
  const customerStats = await refreshCustomerIndex();
  const itemStats = await refreshItemIndex();

  const pagos = await getPagos({ fechaDesde, fechaHasta });
  const result = { enCola: 0, yaSincronizadas: 0, customerStats, itemStats };

  for (const pago of pagos) {
    if (await isInvoiceSynced(pago.id)) {
      result.yaSincronizadas += 1;
      continue;
    }

    const lineas = await getLineasCandidatas(pago.id_paciente, pago.fecha_recepcion);
    const draft = await buildDraft(pago.id_paciente, pago, lineas);
    await upsertDraft(pago.id, pago.id_paciente, draft);
    result.enCola += 1;
  }

  return result;
}

/** Corre el mismo flujo pero para un solo paciente (modo de prueba). Tampoco crea nada automaticamente. */
export async function runSyncForPaciente(idPaciente) {
  await refreshCustomerIndex();
  await refreshItemIndex();

  const pagos = await getPagosByPaciente(idPaciente);
  const result = { enCola: 0, yaSincronizadas: 0 };

  for (const pago of pagos) {
    if (await isInvoiceSynced(pago.id)) {
      result.yaSincronizadas += 1;
      continue;
    }
    const lineas = await getLineasCandidatas(idPaciente, pago.fecha_recepcion);
    const draft = await buildDraft(idPaciente, pago, lineas);
    await upsertDraft(pago.id, idPaciente, draft);
    result.enCola += 1;
  }

  return result;
}

/**
 * Lista los pagos de un dia (o rango) tal como estan en Dentalink, con su
 * estado actual en nuestro sistema (ya sincronizado / en cola / pendiente),
 * para poder elegir cual traer antes de procesarlo.
 */
export async function listarPagosDelDia({ fechaDesde, fechaHasta } = {}) {
  const pagos = await getPagos({ fechaDesde, fechaHasta });
  const drafts = await getPendingDrafts();
  const idsEnCola = new Set(drafts.map((d) => d.id_pago));

  const resultado = [];
  for (const pago of pagos) {
    resultado.push({
      id: pago.id,
      idPaciente: pago.id_paciente,
      nombrePaciente: pago.nombre_paciente ?? null,
      medioPago: pago.medio_pago ?? null,
      folio: pago.folio ?? null,
      fechaRecepcion: pago.fecha_recepcion,
      monto: pago.monto_pago,
      estado: (await isInvoiceSynced(pago.id))
        ? 'sincronizado'
        : idsEnCola.has(String(pago.id))
          ? 'en_cola'
          : 'pendiente',
    });
  }
  return resultado;
}

/**
 * Trae/actualiza el detalle completo de un pago puntual y SIEMPRE lo deja en
 * la cola de revision -- nunca crea la factura automaticamente, aunque el
 * cliente y todas las prestaciones ya matcheen limpio. La creacion real solo
 * ocurre cuando un humano confirma explicitamente desde la cola de revision
 * (createInvoiceFromQueue), para evitar facturas disparadas por error al
 * simplemente traer el detalle de un pago.
 */
export async function procesarPagoIndividual(idPago) {
  const pago = await getPagoPorId(idPago);
  if (!pago) throw new Error(`Pago ${idPago} no encontrado en Dentalink`);
  if (await isInvoiceSynced(pago.id)) throw new Error('Este pago ya fue sincronizado antes');

  await refreshCustomerIndex();
  await refreshItemIndex();

  const lineas = await getLineasCandidatas(pago.id_paciente, pago.fecha_recepcion);
  const draft = await buildDraft(pago.id_paciente, pago, lineas);

  await upsertDraft(pago.id, pago.id_paciente, draft);
  return { creada: false };
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
