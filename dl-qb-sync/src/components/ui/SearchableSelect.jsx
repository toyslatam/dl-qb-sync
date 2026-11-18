import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const ALTO_PANEL = 300; // alto maximo del panel (buscador + lista), para decidir si abre hacia arriba

/** Minusculas y sin acentos, para que "maria" encuentre "María". */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * <select> con buscador: boton que muestra el valor elegido y abre un panel
 * con un input de texto para filtrar la lista + las opciones. Reemplaza los
 * <select> nativos en toda la app para listas que pueden crecer (doctores,
 * facturas, terminos, metodos de pago, cuentas).
 *
 * El panel se dibuja en un portal con posicion fija: si se dibujara dentro de
 * la tarjeta, una tarjeta con overflow lo recortaba (en la ultima fila solo se
 * veia el buscador). Si no cabe debajo del boton, abre hacia arriba.
 */
export default function SearchableSelect({ options, value, onChange, placeholder = '(elegir)', disabled, loading, className }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const [posicion, setPosicion] = useState(null);
  const raiz = useRef(null);
  const boton = useRef(null);
  const panel = useRef(null);
  const inputRef = useRef(null);
  const listaRef = useRef(null);

  // Defensivo: si algo aguas arriba entrega un error en vez de una lista
  // (ej. un endpoint que responde 500), esto no debe tumbar toda la app.
  const opcionesSeguras = Array.isArray(options) ? options : [];

  const seleccionado = opcionesSeguras.find((o) => String(o.value) === String(value));

  // Cada palabra buscada debe aparecer en la opcion, en cualquier orden.
  const filtradas = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return opcionesSeguras;
    return opcionesSeguras.filter((o) => {
      const etiqueta = normalizar(o.label);
      return palabras.every((p) => etiqueta.includes(p));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, busqueda]);

  function cerrar() {
    setAbierto(false);
    setBusqueda('');
  }

  function elegir(o) {
    onChange(o.value);
    cerrar();
    boton.current?.focus();
  }

  function calcularPosicion() {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const espacioAbajo = window.innerHeight - r.bottom;
    const haciaArriba = espacioAbajo < ALTO_PANEL && r.top > espacioAbajo;
    setPosicion({
      left: r.left,
      width: Math.max(r.width, 260),
      ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }

  useLayoutEffect(() => {
    if (!abierto) return undefined;
    calcularPosicion();
    // capture: tambien reacciona al scroll de cualquier contenedor, no solo de la ventana
    window.addEventListener('scroll', calcularPosicion, true);
    window.addEventListener('resize', calcularPosicion);
    return () => {
      window.removeEventListener('scroll', calcularPosicion, true);
      window.removeEventListener('resize', calcularPosicion);
    };
  }, [abierto]);

  useEffect(() => {
    function onClickFuera(e) {
      if (raiz.current?.contains(e.target) || panel.current?.contains(e.target)) return;
      cerrar();
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 0);
  }, [abierto]);

  useEffect(() => {
    setResaltado(0);
  }, [busqueda, abierto]);

  useEffect(() => {
    listaRef.current?.children[resaltado]?.scrollIntoView({ block: 'nearest' });
  }, [resaltado]);

  function onTeclaBuscador(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, filtradas.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtradas[resaltado]) elegir(filtradas[resaltado]);
    } else if (e.key === 'Escape') {
      cerrar();
      boton.current?.focus();
    }
  }

  return (
    <div ref={raiz} className={cn('relative', className)}>
      <button
        ref={boton}
        type="button"
        disabled={disabled || loading}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm text-slate-800 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50',
          abierto && 'border-primary ring-2 ring-primary/15'
        )}
      >
        <span className={cn('truncate', !seleccionado && 'text-slate-500')}>
          {loading ? 'Cargando…' : seleccionado ? seleccionado.label : placeholder}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {seleccionado && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Quitar selección"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className={cn('text-slate-500 transition-transform', abierto && 'rotate-180')} />
        </div>
      </button>

      {abierto &&
        posicion &&
        createPortal(
          <div
            ref={panel}
            style={{ position: 'fixed', ...posicion }}
            className="z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-popover"
          >
            <div className="relative mb-2">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={inputRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={onTeclaBuscador}
                placeholder="Buscar…"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-[0.9375rem] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div ref={listaRef} className="max-h-56 overflow-y-auto">
              {filtradas.length === 0 && <p className="px-3 py-2.5 text-[0.9375rem] text-slate-500">Sin resultados.</p>}
              {filtradas.map((o, i) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseEnter={() => setResaltado(i)}
                  onClick={() => elegir(o)}
                  className={cn(
                    'block w-full truncate rounded-lg px-3 py-2 text-left text-[0.9375rem]',
                    String(o.value) === String(value)
                      ? 'bg-primary-light font-medium text-primary'
                      : i === resaltado
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
