import { useMemo, useState } from 'react';
import { CheckCircle2, Trash2, Plus, ListChecks, X, Search } from 'lucide-react';
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

function LineaCard({ linea, busy, editing, seleccionando, seleccionada, onToggleSeleccion, onEditingChange, onEditar, onEliminar, onAsignarItem, onCrearItem }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {seleccionando && (
            <input
              type="checkbox"
              checked={seleccionada}
              onChange={() => onToggleSeleccion(linea.idDetalle)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{linea.nombre}</p>
        </div>
        {!seleccionando && (
          <button onClick={() => onEliminar(linea.idDetalle)} disabled={busy} className="shrink-0 text-slate-300 hover:text-danger">
            <Trash2 size={15} />
          </button>
        )}
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

export default function ServicesCard({ lineas, busy, onEditar, onEliminar, onEliminarVarias, onAsignarItem, onCrearItem, onAgregarLinea }) {
  const [editingId, setEditingId] = useState(null);
  const [nueva, setNueva] = useState({ nombre: '', precio: '', cantidad: 1 });
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lineas;
    return lineas.filter((l) =>
      `${l.nombre} ${l.qbItemName ?? ''} ${l.qbItemId ?? ''} ${l.precio ?? ''}`.toLowerCase().includes(q)
    );
  }, [lineas, busqueda]);

  function toggleSeleccion(idDetalle) {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(idDetalle)) nuevo.delete(idDetalle);
      else nuevo.add(idDetalle);
      return nuevo;
    });
  }

  function empezarSeleccion() {
    setSeleccionando(true);
    setSeleccionadas(new Set());
    setBusqueda('');
  }

  function cancelarSeleccion() {
    setSeleccionando(false);
    setSeleccionadas(new Set());
    setBusqueda('');
  }

  async function eliminarTodas() {
    if (!confirm(`¿Eliminar las ${lineas.length} línea(s) de este pago?`)) return;
    await onEliminarVarias(lineas.map((l) => l.idDetalle));
  }

  async function mantenerSeleccionadas() {
    const aBorrar = lineas.filter((l) => !seleccionadas.has(l.idDetalle)).map((l) => l.idDetalle);
    if (aBorrar.length === 0) return;
    if (!confirm(`Se van a eliminar ${aBorrar.length} línea(s) y quedar solo las ${seleccionadas.size} seleccionadas. ¿Continuar?`)) return;
    await onEliminarVarias(aBorrar);
    cancelarSeleccion();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prestaciones</CardTitle>
        <div className="flex items-center gap-3">
          <span className="text-[0.78rem] text-slate-400">{lineas.length} línea(s)</span>
          {lineas.length > 1 &&
            (seleccionando ? (
              <Button variant="ghost" size="sm" onClick={cancelarSeleccion}>
                <X size={13} />
                Cancelar
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={empezarSeleccion}>
                  <ListChecks size={13} />
                  Seleccionar
                </Button>
                <Button variant="outlineDanger" size="sm" onClick={eliminarTodas} disabled={busy}>
                  <Trash2 size={13} />
                  Eliminar todas
                </Button>
              </>
            ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {seleccionando && (
          <div className="space-y-2 rounded-xl bg-primary-light px-3 py-2.5">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary/50" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar prestación…"
                className="h-8 w-full rounded-lg border border-primary/20 bg-white pl-7 pr-2 text-[0.82rem] focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-primary">
              <span className="font-medium">
                {seleccionadas.size} de {lineas.length} seleccionadas
                {busqueda && <> · {visibles.length} visible(s)</>}
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSeleccionadas((prev) => new Set([...prev, ...visibles.map((l) => l.idDetalle)]))}
                >
                  {busqueda ? 'Seleccionar visibles' : 'Todas'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSeleccionadas(new Set())}>
                  Ninguna
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={mantenerSeleccionadas}
                  disabled={busy || seleccionadas.size === 0 || seleccionadas.size === lineas.length}
                >
                  <Trash2 size={13} />
                  Borrar el resto ({lineas.length - seleccionadas.size})
                </Button>
              </div>
            </div>
          </div>
        )}

        {(seleccionando ? visibles : lineas).map((linea) => (
          <LineaCard
            key={linea.idDetalle}
            linea={linea}
            busy={busy}
            editing={editingId === linea.idDetalle}
            seleccionando={seleccionando}
            seleccionada={seleccionadas.has(linea.idDetalle)}
            onToggleSeleccion={toggleSeleccion}
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
