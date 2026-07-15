import { useState } from 'react';
import { Loader2, Check, FileCheck2, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button.jsx';

export default function BottomActionBar({
  visible,
  listo,
  busy,
  savedHint,
  totalFactura,
  clienteNombre,
  onCancelar,
  onGuardar,
  onCrearFactura,
}) {
  const [confirmando, setConfirmando] = useState(null); // null | false (registrarPago)

  if (!visible) return null;

  if (confirmando !== null) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-amber-200 bg-warning-light/95 px-4 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3">
          <AlertTriangle size={18} className="shrink-0 text-warning" />
          <p className="flex-1 text-sm font-medium text-slate-800">
            Vas a crear en QuickBooks una factura de <strong>${totalFactura.toFixed(2)}</strong> a nombre de{' '}
            <strong>{clienteNombre}</strong>
            {confirmando ? ' y se registrará el pago de inmediato.' : '.'} Esta acción no se puede deshacer desde la app.
          </p>
          <Button variant="ghost" size="md" onClick={() => setConfirmando(null)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={busy}
            onClick={async () => {
              await onCrearFactura(confirmando);
              setConfirmando(null);
            }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
            Sí, crear factura por ${totalFactura.toFixed(2)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-2">
        {savedHint && (
          <span className="mr-auto flex items-center gap-1 text-[0.8rem] font-medium text-success">
            <Check size={14} /> {savedHint}
          </span>
        )}
        <Button variant="ghost" size="md" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variant="secondary" size="md" onClick={onGuardar}>
          Guardar
        </Button>
        <Button variant="secondary" size="lg" disabled={!listo || busy} onClick={() => setConfirmando(false)}>
          <FileCheck2 size={16} />
          Crear factura
        </Button>
        <Button variant="primary" size="lg" disabled={!listo || busy} onClick={() => setConfirmando(true)}>
          <FileCheck2 size={16} />
          Crear factura + registrar pago
        </Button>
      </div>
    </div>
  );
}
