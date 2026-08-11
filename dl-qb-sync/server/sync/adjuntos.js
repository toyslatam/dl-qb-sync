import { getInvoicesByDateRange, getAdjuntosFacturas } from '../integrations/quickbooks.js';

/**
 * Lista las facturas de un rango de fechas junto con su PDF adjunto en
 * QuickBooks (si tiene). Solo lectura -- para el modulo de Adjuntos.
 */
export async function listarAdjuntos({ fechaDesde, fechaHasta }) {
  const [invoices, adjuntosPorNumero] = await Promise.all([
    getInvoicesByDateRange(fechaDesde, fechaHasta),
    getAdjuntosFacturas(),
  ]);

  return invoices
    .map((inv) => {
      const adjunto = adjuntosPorNumero.get(String(inv.DocNumber));
      return {
        idFactura: inv.Id,
        numeroFactura: inv.DocNumber,
        paciente: inv.CustomerRef?.name ?? '',
        monto: Number(inv.TotalAmt ?? 0),
        fecha: inv.TxnDate,
        adjuntoId: adjunto?.id ?? null,
        nombreArchivo: adjunto?.fileName ?? null,
      };
    })
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}
