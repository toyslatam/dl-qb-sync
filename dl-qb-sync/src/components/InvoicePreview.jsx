import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';

export default function InvoicePreview({ draft }) {
  const total = draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista previa de la factura</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Cliente</p>
              <p className="text-sm font-semibold text-slate-800">
                {draft.customerMatch?.qbDisplayName || draft.customerMatch?.qbCustomerId || '(sin asignar)'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">Factura N.°</p>
              <p className="text-sm font-semibold text-slate-800">
                {draft.factura?.docNumber ?? draft.pago.folioBoleta ?? draft.pago.id}
              </p>
              <p className="mt-1 text-[0.75rem] text-slate-500">{draft.factura?.txnDate ?? draft.pago.fecha}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-12 gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">
              <span className="col-span-6">Concepto</span>
              <span className="col-span-2 text-right">Cant.</span>
              <span className="col-span-2 text-right">Precio</span>
              <span className="col-span-2 text-right">Importe</span>
            </div>
            {draft.lineas.map((l) => (
              <div key={l.idDetalle} className="grid grid-cols-12 gap-2 border-t border-slate-100 py-2 text-sm">
                <span className="col-span-6 truncate text-slate-700">{l.qbItemName || l.nombre}</span>
                <span className="col-span-2 text-right text-slate-600">{l.cantidad ?? 1}</span>
                <span className="col-span-2 text-right text-slate-600">{l.precio ?? '—'}</span>
                <span className="col-span-2 text-right font-medium text-slate-800">
                  {l.precio !== null ? (l.precio * (l.cantidad ?? 1)).toFixed(2) : '—'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t-2 border-slate-200 pt-4">
            <span className="text-sm font-semibold text-slate-500">Total</span>
            <span className="text-3xl font-extrabold tracking-tight text-slate-900">${total.toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
