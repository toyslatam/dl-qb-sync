import { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Download,
  Loader2,
  FlaskConical,
  UserX,
  AlertTriangle,
  CheckCircle2,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  DollarSign,
  FileText,
  Stethoscope,
  Clock,
} from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import SearchableSelect from './ui/SearchableSelect.jsx';
import FacturaLookupModal from './FacturaLookupModal.jsx';
import { cn } from '../lib/utils.js';

function hoy() {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

function primerDiaDelMes() {
  const h = hoy();
  return `${h.slice(0, 7)}-01`;
}

const inputClass =
  'h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

const PAGE_SIZE = 25;

function StatTile({ icon: Icon, label, value, tone = 'slate' }) {
  const tonos = {
    slate: 'text-slate-900',
    primary: 'text-primary',
    warning: 'text-warning',
    success: 'text-success',
  };
  return (
    <div className="flex-1 rounded-card border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-1.5 flex items-center gap-1.5 text-slate-400">
        <Icon size={14} />
        <span className="text-[0.72rem] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-2xl font-extrabold tracking-tight', tonos[tone])}>{value}</p>
    </div>
  );
}

const COLUMNAS_DETALLE = [
  { key: 'doctor', label: 'Doctor' },
  { key: 'numeroPago', label: '# Pago' },
  { key: 'paciente', label: 'Paciente' },
  { key: 'medioPago', label: 'Medio de pago' },
  { key: 'totalAsociado', label: 'Total', numeric: true },
  { key: 'laboratorios', label: 'Laboratorios', numeric: true },
  { key: 'base', label: 'Base', numeric: true },
  { key: 'comisionPct', label: '% Com.', numeric: true },
  { key: 'comisionAPagar', label: 'Comisión', numeric: true },
];

function DetalleTab({ filas }) {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState({ campo: 'comisionAPagar', dir: 'desc' });
  const [pagina, setPagina] = useState(1);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let base = filas;
    if (q) {
      base = filas.filter((f) =>
        `${f.doctor} ${f.numeroPago} ${f.nombrePaciente} ${f.apellidosPaciente} ${f.medioPago}`.toLowerCase().includes(q)
      );
    }
    const valor = (f) => {
      if (orden.campo === 'paciente') return `${f.nombrePaciente} ${f.apellidosPaciente}`;
      return f[orden.campo];
    };
    return [...base].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return orden.dir === 'asc' ? cmp : -cmp;
    });
  }, [filas, busqueda, orden]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visibles = filtradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  function cambiarOrden(campo) {
    setOrden((o) => (o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'desc' }));
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPagina(1);
          }}
          placeholder="Buscar por doctor, paciente, # pago…"
          className={`${inputClass} w-full pl-9`}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[0.7rem] uppercase tracking-wide text-slate-400">
                {COLUMNAS_DETALLE.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => cambiarOrden(c.key === 'paciente' ? 'paciente' : c.key)}
                    className={cn('cursor-pointer select-none px-4 py-3 font-semibold hover:text-slate-600', c.numeric && 'text-right')}
                  >
                    <span className={cn('inline-flex items-center gap-1', c.numeric && 'flex-row-reverse')}>
                      {c.label}
                      {orden.campo === c.key ? (
                        orden.dir === 'asc' ? (
                          <ArrowUp size={11} />
                        ) : (
                          <ArrowDown size={11} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={COLUMNAS_DETALLE.length} className="px-4 py-10 text-center text-sm text-slate-400">
                    Sin resultados.
                  </td>
                </tr>
              )}
              {visibles.map((f, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-2 whitespace-nowrap">{f.doctor}</td>
                  <td className="px-4 py-2">{f.numeroPago}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {f.nombrePaciente} {f.apellidosPaciente}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{f.medioPago}</td>
                  <td className="px-4 py-2 text-right">${f.totalAsociado.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{f.laboratorios ? `$${f.laboratorios.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2 text-right">${f.base.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">{Math.round(f.comisionPct * 100)}%</td>
                  <td className="px-4 py-2 text-right font-semibold text-primary">${f.comisionAPagar.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-[0.8rem] text-slate-500">
        <span>{filtradas.length} factura(s)</span>
        {totalPaginas > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span>
              página {pagina} de {totalPaginas}
            </span>
            <Button variant="ghost" size="sm" disabled={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComisionesModule() {
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [resultado, setResultado] = useState(null);
  const [asignaciones, setAsignaciones] = useState({}); // indice del costo de laboratorio -> idFactura
  const [asignacionesDoctor, setAsignacionesDoctor] = useState({}); // idFactura -> id del doctor
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumen');
  const [costoParaAsociar, setCostoParaAsociar] = useState(null); // costo de laboratorio abierto en el lookup

  async function calcular(asignacionesActuales = asignaciones, asignacionesDoctorActuales = asignacionesDoctor) {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/comisiones', {
        method: 'POST',
        body: JSON.stringify({
          desde,
          hasta,
          asignacionesLaboratorio: asignacionesActuales,
          asignacionesDoctor: asignacionesDoctorActuales,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setResultado(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const pendientesTotal = resultado ? resultado.sinIdentificar.length + resultado.laboratoriosPendientes.length : 0;

  // Al calcular (o cuando cambian los pendientes), llevar al usuario primero a
  // donde hay que actuar; si no hay nada pendiente, mostrar el resumen.
  useEffect(() => {
    if (!resultado) return;
    setTab(pendientesTotal > 0 ? 'pendientes' : 'resumen');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado === null]);

  useEffect(() => {
    if (tab === 'pendientes' && pendientesTotal === 0 && resultado) setTab('resumen');
  }, [pendientesTotal, tab, resultado]);

  function asignarLaboratorio(indice, idFactura) {
    const nuevas = { ...asignaciones };
    if (idFactura) nuevas[indice] = idFactura;
    else delete nuevas[indice];
    setAsignaciones(nuevas);
    calcular(nuevas, asignacionesDoctor);
  }

  function asignarDoctor(idFactura, doctorId) {
    const nuevas = { ...asignacionesDoctor };
    if (doctorId) nuevas[idFactura] = doctorId;
    else delete nuevas[idFactura];
    setAsignacionesDoctor(nuevas);
    calcular(asignaciones, nuevas);
  }

  async function descargar() {
    setDescargando(true);
    setError('');
    try {
      const res = await apiFetch('/api/comisiones/descargar', {
        method: 'POST',
        body: JSON.stringify({ desde, hasta, asignacionesLaboratorio: asignaciones, asignacionesDoctor }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al descargar');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comisiones-${desde}-a-${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  const TABS = resultado
    ? [
        { key: 'resumen', label: 'Resumen' },
        ...(pendientesTotal > 0 ? [{ key: 'pendientes', label: `Pendientes (${pendientesTotal})` }] : []),
        { key: 'detalle', label: `Detalle (${resultado.filas.length})` },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          <span className="mr-2 inline-flex"><Calculator size={18} /></span>
          Comisiones
        </h1>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Desde</span>
            <input type="date" className={inputClass} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-slate-400">Hasta</span>
            <input type="date" className={inputClass} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setAsignaciones({});
              setAsignacionesDoctor({});
              calcular({}, {});
            }}
            disabled={loading}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            Calcular
          </Button>
          {resultado && (
            <Button variant="secondary" size="md" onClick={descargar} disabled={descargando}>
              {descargando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Descargar Excel
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {resultado?.laboratorioError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-warning-light px-3 py-2.5 text-sm">
          <span className="text-slate-700">
            <strong>Laboratorios en $0:</strong> QuickBooks #2 todavía no está conectado ({resultado.laboratorioError}).
          </span>
          <a
            href="/api/qbo2/connect"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-medium text-primary shadow-card hover:bg-primary-light"
          >
            Conectar QuickBooks #2
          </a>
        </div>
      )}

      {!resultado && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-20 text-center shadow-card">
          <Calculator size={32} className="text-slate-300" />
          <p className="text-sm text-slate-400">Elige un rango de fechas y presiona Calcular.</p>
        </div>
      )}

      {resultado && (
        <>
          {/* 1. Dashboard superior */}
          <div className="flex flex-wrap gap-3">
            <StatTile icon={DollarSign} label="Total Comisión" value={`$${resultado.totalGeneral.toFixed(2)}`} tone="primary" />
            <StatTile icon={FileText} label="Facturas" value={resultado.filas.length} />
            <StatTile icon={Stethoscope} label="Doctores" value={resultado.resumen.length} />
            <StatTile
              icon={Clock}
              label="Pendientes"
              value={pendientesTotal}
              tone={pendientesTotal > 0 ? 'warning' : 'success'}
            />
          </div>

          {/* 2. Centro de alertas dinamico */}
          {pendientesTotal > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-200 bg-warning-light px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Existen pendientes antes de finalizar</p>
                  <p className="mt-0.5 text-[0.85rem] text-slate-600">
                    {resultado.sinIdentificar.length > 0 && <>{resultado.sinIdentificar.length} factura(s) sin doctor</>}
                    {resultado.sinIdentificar.length > 0 && resultado.laboratoriosPendientes.length > 0 && ' · '}
                    {resultado.laboratoriosPendientes.length > 0 && (
                      <>{resultado.laboratoriosPendientes.length} laboratorio(s) sin asignar</>
                    )}
                  </p>
                </div>
              </div>
              <Button variant="primary" size="md" onClick={() => setTab('pendientes')}>
                Resolver pendientes
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-card border border-emerald-200 bg-success-light px-5 py-4">
              <CheckCircle2 size={20} className="shrink-0 text-success" />
              <div>
                <p className="text-sm font-bold text-slate-800">Todo listo</p>
                <p className="mt-0.5 text-[0.85rem] text-slate-600">No existen pendientes. Puedes exportar el reporte.</p>
              </div>
            </div>
          )}

          {/* 3. Tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'relative px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === t.key ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {t.label}
                {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>

          {/* 4/5/6. Contenido de cada tab */}
          {tab === 'pendientes' && (
            <div className="space-y-4">
              {resultado.sinIdentificar.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2 text-danger">
                        <UserX size={16} />
                        Facturas sin doctor ({resultado.sinIdentificar.length})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="mb-1 text-sm text-slate-500">
                      La Nota para cliente no coincide con ningún doctor del catálogo. Elige el doctor real para que esta
                      factura entre en el cálculo (esto solo corrige el reporte, no cambia la factura en QuickBooks).
                    </p>
                    {resultado.sinIdentificar.map((s) => (
                      <div
                        key={s.idFactura}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-danger-light px-3 py-2.5"
                      >
                        <div className="min-w-[220px] flex-1 text-sm">
                          <span className="font-medium text-slate-800">{s.paciente || '(sin paciente)'}</span>
                          <span className="text-slate-500">
                            {' '}
                            · #{s.docNumber} · {s.fecha} · nota: "{s.notaCliente || '(vacía)'}" · ${Number(s.total).toFixed(2)}
                          </span>
                        </div>
                        <SearchableSelect
                          className="w-64"
                          options={resultado.doctoresDisponibles.map((d) => ({
                            value: d.id,
                            label: `${d.titulo} ${d.nombre} ${d.apellido}`,
                          }))}
                          value={asignacionesDoctor[s.idFactura]}
                          onChange={(v) => asignarDoctor(s.idFactura, v)}
                          placeholder="(elegir doctor)"
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {resultado.laboratoriosPendientes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <span className="flex items-center gap-2 text-warning">
                        <FlaskConical size={16} />
                        Costos de laboratorio ({resultado.laboratoriosPendientes.length})
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="mb-1 text-sm text-slate-500">
                      Busca y asocia cada costo a la factura correcta — no se asigna solo porque el paciente podría tener
                      más de una factura en el rango, o el nombre no coincide exacto.
                    </p>
                    {resultado.laboratoriosPendientes.map((l) => (
                      <div
                        key={l.indice}
                        className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-100 bg-warning-light/40 px-3 py-2.5"
                      >
                        <div className="min-w-[220px] flex-1 text-sm">
                          <span className="font-medium text-slate-800">{l.paciente || '(sin paciente)'}</span>
                          <span className="text-slate-500">
                            {' '}
                            · {l.doctorTexto || 'sin doctor'} · #{l.numero} · {l.fecha} · ${Number(l.monto).toFixed(2)}
                          </span>
                        </div>
                        <Button variant="secondary" size="md" onClick={() => setCostoParaAsociar(l)}>
                          <Search size={14} />
                          Buscar y asociar factura
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {pendientesTotal === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-16 text-center shadow-card">
                  <CheckCircle2 size={28} className="text-success" />
                  <p className="text-sm font-medium text-slate-600">No existen pendientes.</p>
                </div>
              )}
            </div>
          )}

          {tab === 'resumen' && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen por doctor</CardTitle>
                <span className="text-sm font-bold text-primary">Total: ${resultado.totalGeneral.toFixed(2)}</span>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {resultado.resumen.length === 0 && <p className="text-sm text-slate-400">Sin comisiones en este rango.</p>}
                {resultado.resumen.map((r) => (
                  <div key={r.doctor} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                    <span className="text-sm font-medium text-slate-800">{r.doctor}</span>
                    <span className="text-sm font-semibold text-primary">${r.total.toFixed(2)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {tab === 'detalle' && <DetalleTab filas={resultado.filas} />}

          <FacturaLookupModal
            open={Boolean(costoParaAsociar)}
            onClose={() => setCostoParaAsociar(null)}
            costo={costoParaAsociar}
            filas={resultado.filas}
            onSeleccionar={(idFactura) => asignarLaboratorio(costoParaAsociar.indice, idFactura)}
          />
        </>
      )}
    </div>
  );
}
