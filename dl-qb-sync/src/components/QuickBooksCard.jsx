import { useState } from 'react';
import { CheckCircle2, XCircle, UserSearch, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import EntitySearchBox from './EntitySearchBox.jsx';

export default function QuickBooksCard({ customerMatch, busy, onAsignar, onCrear }) {
  const [modo, setModo] = useState(null); // null | 'buscar' | 'crear'
  const [nombreNuevo, setNombreNuevo] = useState('');

  if (customerMatch) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cliente QuickBooks</CardTitle>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-[0.72rem] font-semibold text-success">
            <CheckCircle2 size={12} strokeWidth={2.5} />
            Cliente encontrado
          </span>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-slate-800">{customerMatch.qbDisplayName || `#${customerMatch.qbCustomerId}`}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cliente QuickBooks</CardTitle>
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-light px-2.5 py-1 text-[0.72rem] font-semibold text-danger">
          <XCircle size={12} strokeWidth={2.5} />
          Cliente no encontrado
        </span>
      </CardHeader>
      <CardContent>
        {modo === null && (
          <div className="flex gap-2">
            <Button variant="primary" size="md" onClick={() => setModo('buscar')} className="flex-1">
              <UserSearch size={15} />
              Buscar cliente
            </Button>
            <Button variant="secondary" size="md" onClick={() => setModo('crear')} className="flex-1">
              <UserPlus size={15} />
              Crear cliente
            </Button>
          </div>
        )}

        {modo === 'buscar' && (
          <div>
            <EntitySearchBox
              endpoint="/api/qbo/customers/buscar"
              labelKey="DisplayName"
              placeholder="Buscar cliente por nombre…"
              onPick={onAsignar}
              autoFocus
            />
            <button onClick={() => setModo(null)} className="mt-2 text-[0.78rem] text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
        )}

        {modo === 'crear' && (
          <div className="flex gap-2">
            <input
              autoFocus
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Nombre del cliente nuevo"
              className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <Button
              variant="primary"
              size="md"
              disabled={busy || !nombreNuevo.trim()}
              onClick={() => {
                onCrear(nombreNuevo);
                setNombreNuevo('');
                setModo(null);
              }}
            >
              Crear
            </Button>
            <button onClick={() => setModo(null)} className="text-[0.78rem] text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
