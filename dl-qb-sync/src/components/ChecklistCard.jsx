import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';

function Item({ ok, label, hint }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {ok ? (
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
      ) : (
        <XCircle size={18} className="mt-0.5 shrink-0 text-danger" />
      )}
      <div>
        <p className={`text-sm font-medium ${ok ? 'text-slate-700' : 'text-slate-800'}`}>{label}</p>
        {!ok && hint && <p className="text-[0.78rem] text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

export default function ChecklistCard({ draft }) {
  const clienteOk = Boolean(draft.customerMatch?.qbCustomerId);
  const lineasOk = draft.lineas.length > 0 && draft.lineas.every((l) => l.estado === 'matched');
  const facturaOk = Boolean(draft.factura?.docNumber);
  const totalFactura = draft.lineas.reduce((sum, l) => sum + (l.precio ?? 0) * (l.cantidad ?? 1), 0);
  const totalOk = draft.lineas.length > 0 && draft.lineas.every((l) => l.precio !== null);
  const listo = clienteOk && lineasOk && facturaOk && totalOk;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de validación</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <Item ok={clienteOk} label="Cliente asignado en QuickBooks" hint="Busca o crea el cliente arriba" />
        <Item ok={lineasOk} label="Todas las prestaciones tienen Item de QuickBooks" hint="Asigna o crea el item que falta" />
        <Item ok={facturaOk} label="Factura con número de documento" hint="Completa el N.° de factura" />
        <Item
          ok={totalOk}
          label={`Total de la factura: $${totalFactura.toFixed(2)}`}
          hint="Hay líneas sin precio definido"
        />
        <div className={`mt-2 rounded-xl px-3 py-2 text-sm font-semibold ${listo ? 'bg-success-light text-success' : 'bg-slate-100 text-slate-500'}`}>
          {listo ? 'Todo listo para crear la factura' : 'Aún faltan pasos por completar'}
        </div>
      </CardContent>
    </Card>
  );
}
