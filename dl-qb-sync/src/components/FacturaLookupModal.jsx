import { useMemo, useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { cn } from '../lib/utils.js';

function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** Que tan bien matchea una factura candidata contra el costo de laboratorio, 0-100. */
function calcularConfianza(costo, factura) {
  let score = 0;

  const tokensCosto = normalizar(costo.paciente).split(/\s+/).filter(Boolean);
  const nombreFactura = normalizar(`${factura.nombrePaciente} ${factura.apellidosPaciente}`);
  const tokensFactura = new Set(nombreFactura.split(/\s+/).filter(Boolean));
  const coincidencias = tokensCosto.filter((t) => tokensFactura.has(t)).length;
  const proporcion = tokensCosto.length ? coincidencias / tokensCosto.length : 0;
  score += proporcion * 70;

  if (costo.fecha && factura.fechaRecepcionPago) {
    if (costo.fecha === factura.fechaRecepcionPago) score += 20;
    else if (costo.fecha.slice(0, 7) === factura.fechaRecepcionPago.slice(0, 7)) score += 8;
  }

  if (Number(factura.totalAsociado) >= Number(costo.monto)) score += 10;

  return Math.round(Math.min(score, 100));
}

const inputClass =
  'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

function ConfianzaBadge({ valor }) {
  const tono = valor >= 85 ? 'bg-success-light text-success' : valor >= 60 ? 'bg-warning-light text-warning' : 'bg-slate-100 text-slate-500';
  return <span className={cn('rounded-full px-2 py-0.5 text-[0.72rem] font-bold', tono)}>{valor}%</span>;
}

function FilaResultado({ f, confianza, onSeleccionar }) {
  return (
    <tr className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
      <td className="px-4 py-2.5 text-slate-500">#{f.numeroPago}</td>
      <td className="px-4 py-2.5 font-medium text-slate-800">
        {f.nombrePaciente} {f.apellidosPaciente}
      </td>
      <td className="px-4 py-2.5 text-slate-500">{f.doctor}</td>
      <td className="px-4 py-2.5 text-slate-500">{f.fechaRecepcionPago}</td>
      <td className="px-4 py-2.5 text-right text-slate-700">${f.totalAsociado.toFixed(2)}</td>
      <td className="px-4 py-2.5 text-slate-500">{f.medioPago}</td>
      <td className="px-4 py-2.5 text-right">
        {confianza !== undefined && <ConfianzaBadge valor={confianza} />}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Button variant="secondary" size="sm" onClick={() => onSeleccionar(f.idFactura)}>
          Seleccionar
        </Button>
      </td>
    </tr>
  );
}

const PAGE_SIZE = 25;

/**
 * Lookup picker para asociar un costo de laboratorio a una factura: busqueda +
 * filtros + sugerencias por similitud (paciente/fecha/monto), en vez de un
 * <select> con cientos de opciones.
 */
export default function FacturaLookupModal({ open, onClose, costo, filas, onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('');
  const [doctorFiltro, setDoctorFiltro] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [pagina, setPagina] = useState(1);

  const doctoresUnicos = useMemo(() => [...new Set(filas.map((f) => f.doctor))].sort(), [filas]);

  const sugeridas = useMemo(() => {
    if (!costo) return [];
    return filas
      .map((f) => ({ ...f, confianza: calcularConfianza(costo, f) }))
      .filter((f) => f.confianza >= 40)
      .sort((a, b) => b.confianza - a.confianza)
      .slice(0, 5);
  }, [costo, filas]);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda);
    return filas.filter((f) => {
      if (doctorFiltro && f.doctor !== doctorFiltro) return false;
      if (fechaFiltro && f.fechaRecepcionPago !== fechaFiltro) return false;
      if (!q) return true;
      const texto = normalizar(`${f.numeroPago} ${f.nombrePaciente} ${f.apellidosPaciente} ${f.doctor}`);
      return texto.includes(q);
    });
  }, [filas, busqueda, doctorFiltro, fechaFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visibles = filtradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  function elegir(idFactura) {
    onSeleccionar(idFactura);
    onClose();
  }

  function cerrar() {
    setBusqueda('');
    setDoctorFiltro('');
    setFechaFiltro('');
    setPagina(1);
    onClose();
  }

  return (
    <Modal open={open} onClose={cerrar} title="Buscar y asociar factura" maxWidth="max-w-4xl">
      {costo && (
        <div className="mb-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
          <span className="font-semibold text-slate-700">Costo de laboratorio:</span>{' '}
          <span className="text-slate-600">
            {costo.paciente || '(sin paciente)'} · {costo.fecha} · ${Number(costo.monto).toFixed(2)} · {costo.proveedor}
          </span>
        </div>
      )}

      {sugeridas.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-semibold text-primary">
            <Sparkles size={14} />
            Coincidencias sugeridas
          </p>
          <div className="space-y-1.5">
            {sugeridas.map((f) => (
              <div
                key={f.idFactura}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary-light/40 px-3.5 py-2.5"
              >
                <div className="flex-1 text-sm">
                  <span className="font-medium text-slate-800">
                    #{f.numeroPago} · {f.nombrePaciente} {f.apellidosPaciente}
                  </span>
                  <span className="text-slate-500">
                    {' '}
                    · {f.doctor} · {f.fechaRecepcionPago} · ${f.totalAsociado.toFixed(2)}
                  </span>
                </div>
                <ConfianzaBadge valor={f.confianza} />
                <Button variant="primary" size="sm" onClick={() => elegir(f.idFactura)}>
                  Usar esta
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-wide text-slate-400">Búsqueda manual</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setPagina(1);
            }}
            placeholder="Paciente, # factura o doctor…"
            className={`${inputClass} w-full pl-8`}
          />
        </div>
        <select
          value={doctorFiltro}
          onChange={(e) => {
            setDoctorFiltro(e.target.value);
            setPagina(1);
          }}
          className={inputClass}
        >
          <option value="">Todos los doctores</option>
          {doctoresUnicos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fechaFiltro}
          onChange={(e) => {
            setFechaFiltro(e.target.value);
            setPagina(1);
          }}
          className={inputClass}
        />
        {(busqueda || doctorFiltro || fechaFiltro) && (
          <button
            onClick={() => {
              setBusqueda('');
              setDoctorFiltro('');
              setFechaFiltro('');
              setPagina(1);
            }}
            className="flex h-9 items-center gap-1 rounded-xl px-2 text-[0.8rem] text-slate-400 hover:text-slate-600"
          >
            <X size={13} />
            Limpiar
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50">
              <tr className="border-b border-slate-100 text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold"># Factura</th>
                <th className="px-4 py-2.5 font-semibold">Paciente</th>
                <th className="px-4 py-2.5 font-semibold">Doctor</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                <th className="px-4 py-2.5 font-semibold">Método de pago</th>
                <th className="px-4 py-2.5"></th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    Sin resultados.
                  </td>
                </tr>
              )}
              {visibles.map((f) => (
                <FilaResultado key={f.idFactura} f={f} onSeleccionar={elegir} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-between text-[0.8rem] text-slate-500">
          <span>
            {filtradas.length} factura(s) · página {pagina} de {totalPaginas}
          </span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <Button variant="ghost" size="sm" disabled={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
