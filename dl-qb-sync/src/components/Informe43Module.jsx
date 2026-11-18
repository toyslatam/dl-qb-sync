import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Download, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { Button } from './ui/Button.jsx';

function mesAnterior() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const dinero = (n) => `$${Number(n ?? 0).toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fechaCorta(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const NOMBRE_MES = new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric' });

const inputClass =
  'h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

const TABS = [
  { key: 'detalle', label: 'Detalle' },
  { key: 'conceptos', label: 'Por concepto' },
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'cuentas', label: 'Cuentas y conceptos' },
];

/** Selector de concepto para una cuenta: 1-7, excluir, o volver al defecto. */
function SelectorConcepto({ cuenta, conceptos, onGuardar, guardando }) {
  const valor = cuenta.concepto === null ? '' : String(cuenta.concepto);
  return (
    <select
      value={valor}
      disabled={guardando}
      onChange={(e) => {
        const v = e.target.value;
        onGuardar(cuenta.id, v === '' ? null : v === 'excluir' ? 'excluir' : Number(v));
      }}
      className={cn(inputClass, 'h-9 w-56', valor === '' && 'border-warning text-warning')}
    >
      <option value="">Sin concepto</option>
      {Object.entries(conceptos).map(([k, nombre]) => (
        <option key={k} value={k}>
          {k} · {nombre}
        </option>
      ))}
      <option value="excluir">No va en el informe</option>
    </select>
  );
}

export default function Informe43Module() {
  const [periodo, setPeriodo] = useState(mesAnterior());
  const [resultado, setResultado] = useState(null);
  const [cuentas, setCuentas] = useState(null);
  const [tab, setTab] = useState('detalle');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [guardandoCuenta, setGuardandoCuenta] = useState(null);
  const [error, setError] = useState('');

  const [anio, mes] = periodo.split('-').map(Number);
  const tituloPeriodo = anio && mes ? NOMBRE_MES.format(new Date(anio, mes - 1, 1)) : '';

  async function calcular() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/informe43', { method: 'POST', body: JSON.stringify({ anio, mes }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error desconocido');
      setResultado(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function descargar() {
    setDescargando(true);
    setError('');
    try {
      const res = await apiFetch('/api/informe43/descargar', { method: 'POST', body: JSON.stringify({ anio, mes }) });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Error al descargar');
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `informe43-${periodo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  async function cargarCuentas() {
    try {
      const res = await apiFetch('/api/informe43/cuentas');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error al cargar cuentas');
      setCuentas(body);
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarConcepto(idCuenta, concepto) {
    setGuardandoCuenta(idCuenta);
    setError('');
    try {
      const res = await apiFetch(`/api/informe43/cuentas/${idCuenta}`, { method: 'PUT', body: JSON.stringify({ concepto }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Error al guardar');
      await Promise.all([cuentas ? cargarCuentas() : null, resultado ? calcular() : null]);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoCuenta(null);
    }
  }

  function cambiarTab(key) {
    setTab(key);
    if (key === 'cuentas' && !cuentas) cargarCuentas();
  }

  const filasFiltradas = useMemo(() => {
    if (!resultado) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return resultado.filas;
    return resultado.filas.filter((f) =>
      [f.nombre, f.ruc, f.factura, f.cuentas].some((v) => String(v ?? '').toLowerCase().includes(q))
    );
  }, [resultado, busqueda]);

  const totalPendientes = resultado ? resultado.proveedoresIncompletos.length + resultado.cuentasSinConcepto.length : 0;
  const conceptos = resultado?.conceptos ?? {
    1: 'Compras de bienes',
    2: 'Servicios básicos',
    3: 'Honorarios y servicios',
    4: 'Alquileres',
    5: 'Cargos bancarios',
    7: 'Impuestos y tasas',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center text-xl font-bold tracking-tight text-slate-900">
            <span className="mr-2 inline-flex"><FileSpreadsheet size={20} /></span>
            Informe 43
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Compras de bienes y servicios del mes, desde las facturas de proveedor y los gastos de QuickBooks.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[0.875rem] font-medium text-slate-600">Mes</span>
            <input type="month" className={inputClass} value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          </label>
          <Button variant="secondary" size="md" onClick={calcular} disabled={loading || !anio}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            Calcular
          </Button>
          <Button variant="primary" size="md" onClick={descargar} disabled={descargando || !resultado}>
            {descargando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Descargar Excel
          </Button>
        </div>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {!resultado && !loading && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-20 text-center">
          <FileSpreadsheet size={32} className="text-slate-300" />
          <p className="text-base text-slate-600">Elige el mes y presiona Calcular.</p>
          <p className="text-sm text-slate-500">Lee QuickBooks en vivo; puede tardar unos segundos.</p>
        </div>
      )}

      {loading && !resultado && (
        <div className="flex items-center justify-center gap-2 rounded-card border border-slate-200 bg-white py-20 text-slate-500">
          <Loader2 size={18} className="animate-spin" />
          Leyendo facturas y gastos de QuickBooks…
        </div>
      )}

      {resultado && (
        <>
          {/* Cifras del mes: una sola tarjeta dividida */}
          <div className="grid grid-cols-2 divide-slate-200 rounded-card border border-slate-200 bg-white md:grid-cols-4 md:divide-x">
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">Compras de {tituloPeriodo}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{dinero(resultado.totalMonto)}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">ITBMS pagado</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{dinero(resultado.totalItbms)}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">Filas del informe</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{resultado.filas.length}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">Leídos de QuickBooks</p>
              <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">
                {resultado.facturasLeidas} facturas · {resultado.gastosLeidos} gastos
              </p>
            </div>
          </div>

          {totalPendientes > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-amber-200 bg-warning-light px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
                <div>
                  <p className="font-semibold text-slate-900">Revisa antes de presentar</p>
                  <p className="text-sm text-slate-700">
                    {resultado.proveedoresIncompletos.length > 0 &&
                      `${resultado.proveedoresIncompletos.length} proveedor(es) sin RUC, DV o tipo de persona en QuickBooks. `}
                    {resultado.cuentasSinConcepto.length > 0 &&
                      `${resultado.cuentasSinConcepto.length} cuenta(s) sin concepto: ${dinero(
                        resultado.cuentasSinConcepto.reduce((s, c) => s + c.monto, 0)
                      )} que hoy no entran al informe.`}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => cambiarTab('pendientes')}>
                Ver pendientes
              </Button>
            </div>
          )}

          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => cambiarTab(t.key)}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2.5 text-[0.9375rem] font-medium transition-colors',
                  tab === t.key ? 'border-primary text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                {t.label}
                {t.key === 'detalle' && ` (${resultado.filas.length})`}
                {t.key === 'pendientes' && totalPendientes > 0 && ` (${totalPendientes})`}
              </button>
            ))}
          </div>

          {tab === 'detalle' && (
            <div className="rounded-card border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="relative w-full max-w-sm">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar proveedor, RUC, factura o cuenta…"
                    className={cn(inputClass, 'w-full pl-9')}
                  />
                </div>
                <p className="shrink-0 text-sm text-slate-500">{filasFiltradas.length} filas</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-left text-[0.8125rem] text-slate-500">
                      <th className="px-4 py-3 font-semibold">Tipo</th>
                      <th className="px-4 py-3 font-semibold">RUC</th>
                      <th className="px-4 py-3 font-semibold">DV</th>
                      <th className="px-4 py-3 font-semibold">Nombre o razón social</th>
                      <th className="px-4 py-3 font-semibold">Factura</th>
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 text-right font-semibold">Concepto</th>
                      <th className="px-4 py-3 text-right font-semibold">Compras</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 text-right font-semibold">ITBMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasFiltradas.map((f) => (
                      <tr key={`${f.origen}-${f.idTxn}-${f.concepto}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5">{f.tipoPersona || <span className="font-medium text-danger">falta</span>}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{f.ruc || <span className="font-medium text-danger">falta</span>}</td>
                        <td className="px-4 py-2.5 tabular-nums">{f.dv || (f.tipoPersona === 'E' ? '—' : <span className="font-medium text-danger">falta</span>)}</td>
                        <td className="max-w-[280px] px-4 py-2.5">
                          <p className="truncate font-medium text-slate-900" title={f.nombre}>{f.nombre}</p>
                          <p className="truncate text-[0.8125rem] text-slate-500" title={f.cuentas}>
                            {f.origen} · {f.cuentas}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">{f.factura}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{fechaCorta(f.fecha)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" title={conceptos[f.concepto]}>{f.concepto}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{f.comprasBienesServicios}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">{dinero(f.monto)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{f.itbms ? dinero(f.itbms) : <span className="text-slate-400">0.00</span>}</td>
                      </tr>
                    ))}
                    {filasFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 text-center text-slate-500">
                          Ninguna fila coincide con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filasFiltradas.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-slate-200 font-semibold text-slate-900">
                        <td colSpan={8} className="px-4 py-3">Total{busqueda && ' (filtrado)'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {dinero(filasFiltradas.reduce((s, f) => s + f.monto, 0))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {dinero(filasFiltradas.reduce((s, f) => s + f.itbms, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {tab === 'conceptos' && (
            <div className="rounded-card border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[0.8125rem] text-slate-500">
                    <th className="px-5 py-3 font-semibold">Concepto</th>
                    <th className="px-5 py-3 text-right font-semibold">Filas</th>
                    <th className="px-5 py-3 text-right font-semibold">Monto</th>
                    <th className="px-5 py-3 text-right font-semibold">ITBMS</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.porConcepto.map((c) => (
                    <tr key={c.concepto} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {c.concepto} · {c.nombre}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.filas}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{dinero(c.monto)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{dinero(c.itbms)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 font-semibold text-slate-900">
                    <td className="px-5 py-3">Total</td>
                    <td className="px-5 py-3 text-right tabular-nums">{resultado.filas.length}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{dinero(resultado.totalMonto)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{dinero(resultado.totalItbms)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {tab === 'pendientes' && (
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-card border border-slate-200 bg-white">
                <div className="px-5 pb-2 pt-5">
                  <h2 className="text-lg font-semibold text-slate-900">Proveedores con datos incompletos</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Se completan en QuickBooks, en la ficha del proveedor: RUC en el teléfono <b>Otro</b>, DV en el{' '}
                    <b>código postal</b> y el tipo de persona (N, J o E) en el <b>Fax</b>. Luego vuelve a calcular.
                  </p>
                </div>
                {resultado.proveedoresIncompletos.length === 0 ? (
                  <p className="px-5 pb-5 pt-2 text-sm text-success">Todos los proveedores del mes están completos.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[0.8125rem] text-slate-500">
                        <th className="px-5 py-2.5 font-semibold">Proveedor</th>
                        <th className="px-5 py-2.5 font-semibold">Falta</th>
                        <th className="px-5 py-2.5 text-right font-semibold">Transacciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.proveedoresIncompletos.map((p) => (
                        <tr key={p.nombre} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-2.5 font-medium text-slate-900">{p.nombre}</td>
                          <td className="px-5 py-2.5 text-danger">{p.faltan.join(', ')}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums">{p.transacciones}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="rounded-card border border-slate-200 bg-white">
                <div className="px-5 pb-2 pt-5">
                  <h2 className="text-lg font-semibold text-slate-900">Cuentas sin concepto</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Estos gastos no entran al informe hasta que su cuenta tenga un concepto. Se recalcula al elegir.
                  </p>
                </div>
                {resultado.cuentasSinConcepto.length === 0 ? (
                  <p className="px-5 pb-5 pt-2 text-sm text-success">Todas las cuentas del mes tienen concepto.</p>
                ) : (
                  <ul>
                    {resultado.cuentasSinConcepto.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {c.numero} {c.nombre}
                          </p>
                          <p className="text-[0.8125rem] text-slate-500">
                            {dinero(c.monto)} en {c.lineas} línea(s) · ej. {c.ejemplos.join(', ')}
                          </p>
                        </div>
                        <SelectorConcepto
                          cuenta={{ id: c.id, concepto: null }}
                          conceptos={conceptos}
                          onGuardar={guardarConcepto}
                          guardando={guardandoCuenta === c.id}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {tab === 'cuentas' && (
            <div className="rounded-card border border-slate-200 bg-white">
              <div className="px-5 pb-3 pt-5">
                <h2 className="text-lg font-semibold text-slate-900">Concepto de cada cuenta de gasto</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Define en qué concepto del Informe 43 cae cada cuenta de QuickBooks. Los cambios aplican a todos los meses.
                </p>
              </div>
              {!cuentas ? (
                <div className="flex items-center gap-2 px-5 pb-6 text-slate-500">
                  <Loader2 size={16} className="animate-spin" /> Cargando cuentas…
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 text-left text-[0.8125rem] text-slate-500">
                      <th className="px-5 py-2.5 font-semibold">Cuenta</th>
                      <th className="px-5 py-2.5 font-semibold">Tipo</th>
                      <th className="px-5 py-2.5 font-semibold">Concepto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentas.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-5 py-2">
                          <span className="font-medium text-slate-900">
                            {c.numero} {c.nombre}
                          </span>
                          {c.ajustado && <span className="ml-2 text-[0.8125rem] text-slate-500">(cambiado a mano)</span>}
                        </td>
                        <td className="px-5 py-2 text-slate-600">{c.tipo}</td>
                        <td className="px-5 py-2">
                          <SelectorConcepto
                            cuenta={c}
                            conceptos={conceptos}
                            onGuardar={guardarConcepto}
                            guardando={guardandoCuenta === c.id}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
