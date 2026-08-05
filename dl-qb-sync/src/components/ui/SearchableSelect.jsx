import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

/**
 * <select> con buscador: boton que muestra el valor elegido y abre un panel
 * con un input de texto para filtrar la lista + las opciones. Reemplaza los
 * <select> nativos en toda la app para listas que pueden crecer (doctores,
 * facturas, terminos, metodos de pago, cuentas).
 */
export default function SearchableSelect({ options, value, onChange, placeholder = '(elegir)', disabled, loading, className }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const raiz = useRef(null);
  const inputRef = useRef(null);

  // Defensivo: si algo aguas arriba entrega un error en vez de una lista
  // (ej. un endpoint que responde 500), esto no debe tumbar toda la app.
  const opcionesSeguras = Array.isArray(options) ? options : [];

  const seleccionado = opcionesSeguras.find((o) => String(o.value) === String(value));

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return opcionesSeguras;
    return opcionesSeguras.filter((o) => o.label.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, busqueda]);

  useEffect(() => {
    function onClickFuera(e) {
      if (raiz.current && !raiz.current.contains(e.target)) {
        setAbierto(false);
        setBusqueda('');
      }
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 0);
  }, [abierto]);

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 disabled:opacity-50',
          abierto && 'border-primary ring-2 ring-primary/15'
        )}
      >
        <span className={cn('truncate', !seleccionado && 'text-slate-400')}>
          {loading ? 'Cargando…' : seleccionado ? seleccionado.label : placeholder}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {seleccionado && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-slate-300 hover:text-slate-600"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className="text-slate-400" />
        </div>
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-popover">
          <div className="relative mb-1.5">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[0.83rem] focus:border-primary focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtradas.length === 0 && <p className="px-2 py-2 text-[0.8rem] text-slate-400">Sin resultados.</p>}
            {filtradas.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setAbierto(false);
                  setBusqueda('');
                }}
                className={cn(
                  'block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[0.85rem]',
                  String(o.value) === String(value) ? 'bg-primary-light text-primary' : 'text-slate-700 hover:bg-slate-100'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
