import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import EntitySelect from './EntitySelect.jsx';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export default function InvoiceCard({ factura, deposito, totalFactura, onChange, onChangeDeposito }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de la factura</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="N.° de factura">
          <input
            value={factura?.docNumber ?? ''}
            onChange={(e) => onChange('docNumber', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Términos">
          <EntitySelect
            endpoint="/api/qbo/terminos"
            value={factura?.termRef}
            onChange={(v) => onChange('termRef', v)}
            placeholder="(sin término)"
          />
        </Field>
        <Field label="Fecha de factura">
          <input
            type="date"
            value={factura?.txnDate ?? ''}
            onChange={(e) => onChange('txnDate', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Fecha de vencimiento">
          <input
            type="date"
            value={factura?.dueDate ?? ''}
            onChange={(e) => onChange('dueDate', e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Nota para el cliente">
            <input
              value={factura?.customerMemo ?? ''}
              onChange={(e) => onChange('customerMemo', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="sm:col-span-2 mt-1 rounded-xl bg-slate-50 p-3.5">
          <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-wide text-slate-400">
            Depósito a registrar (si se usa "Crear factura + registrar pago")
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Monto">
              <input value={totalFactura.toFixed(2)} disabled className={`${inputClass} bg-slate-100 text-slate-500`} />
            </Field>
            <Field label="Método de pago">
              <EntitySelect
                endpoint="/api/qbo/metodos-pago"
                value={deposito?.metodoPagoRef}
                onChange={(v) => onChangeDeposito('metodoPagoRef', v)}
                placeholder="(opcional)"
              />
            </Field>
            <Field label="Depositar en">
              <EntitySelect
                endpoint="/api/qbo/cuentas-deposito"
                value={deposito?.depositarEnRef}
                onChange={(v) => onChangeDeposito('depositarEnRef', v)}
                placeholder="(sin cuenta)"
              />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
