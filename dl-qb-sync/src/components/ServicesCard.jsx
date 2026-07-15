import { useState } from 'react';
import { CheckCircle2, Trash2, Plus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import EntitySearchBox from './EntitySearchBox.jsx';

function ItemPicker({ nombreSugerido, busy, onAsignar, onCrear, onCancel }) {
  const [modo, setModo] = useState('buscar');
  const [nombre, setNombre] = useState(nombreSugerido);

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => setModo('buscar')}
          className={`rounded-lg px-2.5 py-1 text-[0.75rem] font-medium ${modo === 'buscar' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
        >
          Buscar existente
        </button>
        <button
          onClick={() => setModo('crear')}
          className={`rounded-lg px-2.5 py-1 text-[0.75rem] font-medium ${modo === 'crear' ? 'bg-primary text-white' : 'bg-white text-slate-600'}`}
        >
          Crear nuevo
        </button>
        <button onClick={onCancel} className="ml-auto text-[0.75rem] text-slate-400 hover:text-slate-600">
          Cancelar
        </button>
      </div>
      {modo === 'buscar' ? (
        <EntitySearchBox endpoint="/api/qbo/items/buscar" labelKey="Name" placeholder="Buscar item…" onPick={onAsignar} />
      ) : (
        <div className="flex gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
          <Button variant="primary" size="md" disabled={busy || !nombre.trim()} onClick={() => onCrear(nombre)}>
            Crear en QuickBooks
          </Button>
        </div>
      )}
    </div>
  );
}

function LineaCard({ linea, busy, editing, onEditingChange, onEditar, onEliminar, onAsignarItem, onCrearItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{linea.nombre}</p>
        <button onClick={() => onEliminar(linea.idDetalle)} disabled={busy} className="shrink-0 text-slate-300 hover:text-danger">
          <Trash2 size={15} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[0.75rem] text-slate-500">
          Precio
          <input
            type="number"
            value={linea.precio ?? ''}
            onChange={(e) => onEditar(linea.idDetalle, 'precio', e.target.value)}
            className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[0.75rem] text-slate-500">
          Cant.
          <input
            type="number"
            value={linea.cantidad ?? 1}
            onChange={(e) => onEditar(linea.idDetalle, 'cantidad', e.target.value)}
            className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>

        <div className="ml-auto">
          {linea.qbItemId ? (
            <button
              onClick={() => onEditingChange(linea.idDetalle)}
              className="inline-flex items-center gap-1 rounded-full bg-success-light px-2.5 py-1 text-[0.72rem] font-semibold text-success hover:opacity-80"
            >
              <CheckCircle2 size={12} strokeWidth={2.5} />
              {linea.qbItemName || linea.qbItemId}
            </button>
          ) : (
            <Button variant="primary" size="sm" onClick={() => onEditingChange(linea.idDetalle)}>
              Asignar item
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <ItemPicker
          nombreSugerido={linea.nombre}
          busy={busy}
          onAsignar={(item) => onAsignarItem(linea.idDetalle, item)}
          onCrear={(nombre) => onCrearItem(linea.idDetalle, nombre)}
          onCancel={() => onEditingChange(null)}
        />
      )}
    </div>
  );
}

export default function ServicesCard({ lineas, busy, onEditar, onEliminar, onAsignarItem, onCrearItem, onAgregarLinea }) {
  const [editingId, setEditingId] = useState(null);
  const [nueva, setNueva] = useState({ nombre: '', precio: '', cantidad: 1 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prestaciones</CardTitle>
        <span className="text-[0.78rem] text-slate-400">{lineas.length} línea(s)</span>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {lineas.map((linea) => (
          <LineaCard
            key={linea.idDetalle}
            linea={linea}
            busy={busy}
            editing={editingId === linea.idDetalle}
            onEditingChange={setEditingId}
            onEditar={onEditar}
            onEliminar={onEliminar}
            onAsignarItem={(idDetalle, item) => {
              onAsignarItem(idDetalle, item);
              setEditingId(null);
            }}
            onCrearItem={(idDetalle, nombre) => {
              onCrearItem(idDetalle, nombre);
              setEditingId(null);
            }}
          />
        ))}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-200 p-3">
          <input
            placeholder="Nombre de la línea"
            value={nueva.nombre}
            onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
            className="h-8 flex-1 min-w-[140px] rounded-lg border border-slate-200 px-2 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="number"
            placeholder="Precio"
            value={nueva.precio}
            onChange={(e) => setNueva({ ...nueva, precio: e.target.value })}
            className="h-8 w-24 rounded-lg border border-slate-200 px-2 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="number"
            placeholder="Cant."
            value={nueva.cantidad}
            onChange={(e) => setNueva({ ...nueva, cantidad: e.target.value })}
            className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-sm focus:border-primary focus:outline-none"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (!nueva.nombre.trim()) return;
              onAgregarLinea(nueva);
              setNueva({ nombre: '', precio: '', cantidad: 1 });
            }}
          >
            <Plus size={14} />
            Agregar línea
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
