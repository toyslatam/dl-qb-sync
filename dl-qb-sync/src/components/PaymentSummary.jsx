import { Card, CardContent } from './ui/Card.jsx';
import StatusBadge from './StatusBadge.jsx';

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default function PaymentSummary({ pago, estado }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Pago #{pago.id}</h2>
          <StatusBadge estado={estado} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Paciente" value={pago.nombrePaciente || `#${pago.idPaciente}`} />
          <Field label="Monto" value={`$${Number(pago.monto ?? 0).toLocaleString('es-PA', { minimumFractionDigits: 2 })}`} />
          <Field label="Método de pago" value={pago.medioPago || '—'} />
          <Field label="Boleta" value={pago.folio || '—'} />
          <Field label="Fecha" value={pago.fechaRecepcion || pago.fecha || '—'} />
        </div>
      </CardContent>
    </Card>
  );
}
