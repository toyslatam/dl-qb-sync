import XLSX from 'xlsx';
import { qboQuery } from '../integrations/quickbooks.js';
import { getSetting, setSetting } from '../db/store.js';

/**
 * Informe 43 (DGI Panama: compras e importaciones de bienes y servicios),
 * armado directo de QuickBooks: facturas de proveedor (Bill) + gastos
 * (Purchase) de un mes. Reemplaza las consultas de Power Query que leian la
 * copia en SharePoint ("Facturas de Compras", "Facturas de Compras ITBMS" y
 * "Gastos"). Solo lectura -- no escribe nada en QuickBooks.
 *
 * Datos del proveedor: en QuickBooks se guardan en campos "prestados" del
 * Vendor -- RUC en el telefono "Otro" (AlternatePhone), DV en el codigo
 * postal (BillAddr.PostalCode) y el tipo de persona (N/J/E) en el Fax.
 */

export const CONCEPTOS = {
  1: 'Compras de bienes',
  2: 'Servicios básicos',
  3: 'Honorarios y servicios',
  4: 'Alquileres',
  5: 'Cargos bancarios',
  7: 'Impuestos y tasas',
};

// Concepto por numero de cuenta de QuickBooks, traducido de la tabla de
// categorias de SharePoint (ej. "COSTO DE LABORATORIOS" = 5100 Laboratorios).
// Se puede cambiar por cuenta desde la app (se guarda en Supabase).
const CONCEPTO_POR_NUMERO = {
  // 1: bienes
  5000: 1, // Insumos Medicos
  5001: 1, // Brackets-Alineadores
  6601: 1, // Papeleria y Utiles de Oficina
  6903: 1, // Atencion a clientes
  6033: 1, // Atencion a Colaboradores
  1530: 1, // Equipo Odontologico
  // 2: servicios basicos
  6802: 2, // Electricidad
  6801: 2, // Gastos de Comunicacion (telefono, internet)
  // 3: honorarios y servicios
  5201: 3, // Honorarios Medicos
  5202: 3, // Comisiones a Especialistas
  5100: 3, // Laboratorios
  5003: 3, // Costo de Mensajeria
  5300: 3, // Mantenimiento Equipo Odontologico
  6120: 3, // Servicios Contables
  6121: 3, // Honorarios Legales
  6122: 3, // Otros Honorarios Profesionales
  6036: 3, // Seminarios y Capacitaciones
  6032: 3, // Atencion Medica y Medicamentos
  6350: 3, // Reparacion y Mantenimiento
  6351: 3, // Aseo y Limpieza
  6352: 3, // Fumigacion
  6230: 3, // Flete, courier, acarreo, delivery
  6302: 3, // Viajes - Transporte
  6400: 3, // Publicidad y Propaganda
  6700: 3, // Seguros
  6905: 3, // Donaciones y Patrocinios
  6906: 3, // Membresias y Suscripciones
  // 4: alquileres
  6100: 4, // Alquileres de Oficina
  6102: 4, // Alquiler de Depositos
  // 5: cargos bancarios
  6500: 5,
  // 7: impuestos
  6201: 7, // Otros Impuestos
};

// Cuentas de gasto que nunca van al informe (el ITBMS mismo, planilla,
// cuentas por cobrar a empleados/medicos, activos, depreciacion).
const EXCLUIDAS_POR_NUMERO = new Set([
  6202, // VAT Gastos (es el ITBMS, no una compra)
  1402, // Cobros Insumos a Medicos
  6037, // Vale a colaboradores
  1700, // Otros Activos
  5203, // Incentivos por Metas
  7000, // Depreciacion
  6000, 6001, 6002, 6003, 6004, // Salarios, representacion, prima, sobretiempo, bonificacion
  6010, 6011, 6012, 6013, // Vacaciones, XIII mes, prima de antiguedad, indemnizacion
  6020, 6021, 6022, // Cuotas patronales
]);
const EXCLUIDAS_POR_NOMBRE = [/^distribuci[oó]n/i];

// Solo estos tipos de cuenta son compras; el resto (bancos, pasivos, CxC,
// patrimonio, ingresos) no se considera ni se avisa.
const TIPOS_CANDIDATOS = new Set(['Expense', 'Cost of Goods Sold', 'Other Expense', 'Fixed Asset']);

const CUENTA_CARGOS_BANCARIOS = '6500';
const ITBMS_CARGOS_BANCARIOS = 0.07;
const CLAVE_AJUSTES = 'informe43_cuentas';

const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function traerTodo(entidad, filtro = '') {
  const filas = [];
  let inicio = 1;
  const tamano = 1000;
  while (true) {
    const r = await qboQuery(`select * from ${entidad}${filtro ? ` where ${filtro}` : ''} STARTPOSITION ${inicio} MAXRESULTS ${tamano}`);
    const pagina = r.QueryResponse?.[entidad] ?? [];
    filas.push(...pagina);
    if (pagina.length < tamano) break;
    inicio += tamano;
  }
  return filas;
}

async function leerAjustes() {
  const crudo = await getSetting(CLAVE_AJUSTES);
  if (!crudo) return {};
  try {
    return typeof crudo === 'string' ? JSON.parse(crudo) : crudo;
  } catch {
    return {};
  }
}

/** Concepto por defecto de una cuenta: numero, 'excluir', o null si no tiene. */
function conceptoPorDefecto(cuenta) {
  const numero = Number(cuenta.AcctNum);
  if (EXCLUIDAS_POR_NUMERO.has(numero) || EXCLUIDAS_POR_NOMBRE.some((re) => re.test(cuenta.Name))) return 'excluir';
  return CONCEPTO_POR_NUMERO[numero] ?? null;
}

/** Cuentas candidatas con su concepto vigente (ajuste manual o defecto). */
async function cargarCuentas() {
  const [cuentas, ajustes] = await Promise.all([traerTodo('Account'), leerAjustes()]);
  const porId = new Map();
  for (const c of cuentas) {
    const candidata = TIPOS_CANDIDATOS.has(c.AccountType);
    const defecto = candidata ? conceptoPorDefecto(c) : 'excluir';
    const ajuste = ajustes[c.Id];
    porId.set(c.Id, {
      id: c.Id,
      numero: c.AcctNum ?? '',
      nombre: c.Name,
      tipo: c.AccountType,
      candidata,
      defecto,
      ajustado: candidata && ajuste !== undefined,
      concepto: candidata && ajuste !== undefined ? ajuste : defecto,
    });
  }
  return porId;
}

export async function listarCuentasInforme43() {
  const cuentas = await cargarCuentas();
  return [...cuentas.values()]
    .filter((c) => c.candidata)
    .sort((a, b) => String(a.numero || 'zzzz').localeCompare(String(b.numero || 'zzzz')) || a.nombre.localeCompare(b.nombre));
}

/** concepto: 1-7, 'excluir', o null para volver al valor por defecto. */
export async function guardarConceptoCuenta(idCuenta, concepto) {
  if (concepto !== null && concepto !== 'excluir' && !CONCEPTOS[concepto]) throw new Error('Concepto no valido');
  const ajustes = await leerAjustes();
  if (concepto === null) delete ajustes[idCuenta];
  else ajustes[idCuenta] = concepto === 'excluir' ? 'excluir' : Number(concepto);
  await setSetting(CLAVE_AJUSTES, JSON.stringify(ajustes));
}

function datosProveedor(vendor) {
  if (!vendor) return { tipoPersona: '', ruc: '', dv: '', nombre: '' };
  return {
    tipoPersona: (vendor.Fax?.FreeFormNumber ?? '').trim().toUpperCase(),
    ruc: (vendor.AlternatePhone?.FreeFormNumber ?? '').trim(),
    dv: (vendor.BillAddr?.PostalCode ?? '').trim(),
    nombre: (vendor.CompanyName || vendor.DisplayName || '').trim(),
  };
}

/** % de ITBMS de compra de cada codigo de impuesto (suma de sus tasas; el reverse charge +7/-7 da 0). */
function tasasPorCodigo(codigos, tasas) {
  const valorTasa = new Map(tasas.map((t) => [t.Id, Number(t.RateValue ?? 0)]));
  const porCodigo = new Map();
  for (const c of codigos) {
    const detalle = c.PurchaseTaxRateList?.TaxRateDetail ?? [];
    porCodigo.set(c.Id, detalle.reduce((sum, d) => sum + (valorTasa.get(d.TaxRateRef?.value) ?? 0), 0));
  }
  return porCodigo;
}

/**
 * Reparte un total ya redondeado entre partes, de modo que los centavos
 * cuadren exacto (metodo del mayor residuo).
 */
function repartirCentavos(total, pesos) {
  const sumaPesos = pesos.reduce((s, p) => s + p, 0);
  const centavos = Math.round(total * 100);
  if (!sumaPesos || !centavos) return pesos.map(() => 0);
  const brutos = pesos.map((p) => (centavos * p) / sumaPesos);
  const base = brutos.map(Math.floor);
  let resto = centavos - base.reduce((s, b) => s + b, 0);
  const orden = brutos.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of orden) {
    if (resto <= 0) break;
    base[i] += 1;
    resto -= 1;
  }
  return base.map((c) => c / 100);
}

/**
 * Lineas de compra de una transaccion con su ITBMS. En Bills (precios sin
 * impuesto) el ITBMS de cada linea sale de su codigo de impuesto y se ajusta
 * al TotalTax de la factura; en gastos con precio incluido sale de
 * TaxInclusiveAmt - Amount. Cargos bancarios en gastos: 7% del monto siempre
 * (misma regla que la consulta "Gastos" original).
 */
function lineasConItbms(txn, { esGasto, tasas }) {
  const signo = esGasto && txn.Credit ? -1 : 1;
  const lineas = [];
  for (const l of txn.Line ?? []) {
    const det = l.AccountBasedExpenseLineDetail;
    if (!det) continue;
    const monto = Number(l.Amount ?? 0) * signo;
    let itbms;
    if (txn.GlobalTaxCalculation === 'TaxInclusive' && det.TaxInclusiveAmt !== undefined) {
      itbms = (Number(det.TaxInclusiveAmt) - Number(l.Amount ?? 0)) * signo;
    } else if (txn.GlobalTaxCalculation === 'NotApplicable') {
      itbms = 0;
    } else {
      itbms = (monto * (tasas.get(det.TaxCodeRef?.value) ?? 0)) / 100;
    }
    lineas.push({ idCuenta: det.AccountRef?.value, monto, itbms, descripcion: l.Description ?? '' });
  }

  // Bills: los centavos del ITBMS deben cuadrar con el TotalTax de QuickBooks.
  const totalTax = Number(txn.TxnTaxDetail?.TotalTax ?? NaN);
  const sumaCruda = lineas.reduce((s, l) => s + l.itbms, 0);
  if (!esGasto && Number.isFinite(totalTax) && sumaCruda > 0) {
    const repartido = repartirCentavos(totalTax, lineas.map((l) => l.itbms));
    lineas.forEach((l, i) => (l.itbms = repartido[i]));
  }
  return lineas;
}

/**
 * Calcula el Informe 43 de un mes. Una fila por transaccion + concepto (si
 * una factura tiene lineas de conceptos distintos, cada concepto lleva el
 * ITBMS de sus propias lineas -- la consulta de SharePoint repetia el ITBMS
 * completo en cada linea).
 */
export async function calcularInforme43({ anio, mes }) {
  const a = Number(anio);
  const m = Number(mes);
  if (!a || !m || m < 1 || m > 12) throw new Error('anio y mes son requeridos');
  const desde = `${a}-${String(m).padStart(2, '0')}-01`;
  const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const rango = `TxnDate >= '${desde}' and TxnDate <= '${hasta}'`;

  const [bills, gastos, vendors, codigos, tasasQb, cuentas] = await Promise.all([
    traerTodo('Bill', rango),
    traerTodo('Purchase', rango),
    traerTodo('Vendor'),
    traerTodo('TaxCode'),
    traerTodo('TaxRate'),
    cargarCuentas(),
  ]);
  const tasas = tasasPorCodigo(codigos, tasasQb);
  const vendorPorId = new Map(vendors.map((v) => [v.Id, v]));

  const filas = [];
  const sinConcepto = new Map(); // idCuenta -> { cuenta, monto, lineas, ejemplos }
  const proveedoresIncompletos = new Map();

  function procesar(txn, esGasto) {
    const entidad = esGasto ? txn.EntityRef : txn.VendorRef;
    const vendor = entidad && (!esGasto || entidad.type === 'Vendor') ? vendorPorId.get(entidad.value) : null;
    const prov = datosProveedor(vendor);
    if (!prov.nombre) prov.nombre = entidad?.name ?? '(sin proveedor)';
    const factura = String(txn.DocNumber || txn.Id);

    const porConcepto = new Map();
    for (const l of lineasConItbms(txn, { esGasto, tasas })) {
      const cuenta = cuentas.get(l.idCuenta);
      if (!cuenta || cuenta.concepto === 'excluir') continue;
      if (cuenta.concepto === null) {
        const s = sinConcepto.get(cuenta.id) ?? { cuenta, monto: 0, lineas: 0, ejemplos: [] };
        s.monto += l.monto;
        s.lineas += 1;
        if (s.ejemplos.length < 3) s.ejemplos.push(`${prov.nombre} ${factura}`);
        sinConcepto.set(cuenta.id, s);
        continue;
      }
      const g = porConcepto.get(cuenta.concepto) ?? { monto: 0, itbms: 0, cuentas: new Set() };
      g.monto += l.monto;
      const esCargoBancario = String(cuenta.numero) === CUENTA_CARGOS_BANCARIOS;
      g.itbms += esGasto && esCargoBancario ? l.monto * ITBMS_CARGOS_BANCARIOS : l.itbms;
      g.cuentas.add(cuenta.numero ? `${cuenta.numero} ${cuenta.nombre}` : cuenta.nombre);
      porConcepto.set(cuenta.concepto, g);
    }
    if (porConcepto.size === 0) return;

    const faltan = [];
    if (!prov.ruc) faltan.push('RUC');
    if (!['N', 'J', 'E'].includes(prov.tipoPersona)) faltan.push('Tipo de persona');
    if (prov.tipoPersona !== 'E' && !prov.dv) faltan.push('DV');
    if (faltan.length) {
      const clave = vendor?.Id ?? `sin-${entidad?.value ?? prov.nombre}`;
      const p = proveedoresIncompletos.get(clave) ?? { nombre: prov.nombre, faltan, transacciones: 0 };
      p.transacciones += 1;
      proveedoresIncompletos.set(clave, p);
    }

    for (const [concepto, g] of porConcepto) {
      filas.push({
        origen: esGasto ? 'Gasto' : 'Factura',
        idTxn: txn.Id,
        tipoPersona: prov.tipoPersona,
        ruc: prov.ruc,
        dv: prov.dv,
        nombre: prov.nombre,
        factura,
        fecha: txn.TxnDate,
        concepto,
        comprasBienesServicios: prov.tipoPersona === 'E' ? 2 : 1,
        monto: redondear(g.monto),
        itbms: redondear(g.itbms),
        cuentas: [...g.cuentas].join(', '),
        incompleto: faltan.length > 0,
      });
    }
  }

  bills.forEach((b) => procesar(b, false));
  gastos.forEach((g) => procesar(g, true));
  filas.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.nombre.localeCompare(y.nombre));

  const totalMonto = redondear(filas.reduce((s, f) => s + f.monto, 0));
  const totalItbms = redondear(filas.reduce((s, f) => s + f.itbms, 0));
  const porConceptoResumen = Object.keys(CONCEPTOS)
    .map((c) => {
      const deEste = filas.filter((f) => String(f.concepto) === c);
      return {
        concepto: Number(c),
        nombre: CONCEPTOS[c],
        filas: deEste.length,
        monto: redondear(deEste.reduce((s, f) => s + f.monto, 0)),
        itbms: redondear(deEste.reduce((s, f) => s + f.itbms, 0)),
      };
    })
    .filter((c) => c.filas > 0);

  return {
    periodo: { anio: a, mes: m, desde, hasta },
    filas,
    totalMonto,
    totalItbms,
    porConcepto: porConceptoResumen,
    facturasLeidas: bills.length,
    gastosLeidos: gastos.length,
    proveedoresIncompletos: [...proveedoresIncompletos.values()].sort((x, y) => x.nombre.localeCompare(y.nombre)),
    cuentasSinConcepto: [...sinConcepto.values()]
      .map((s) => ({
        id: s.cuenta.id,
        numero: s.cuenta.numero,
        nombre: s.cuenta.nombre,
        monto: redondear(s.monto),
        lineas: s.lineas,
        ejemplos: s.ejemplos,
      }))
      .sort((x, y) => y.monto - x.monto),
    conceptos: CONCEPTOS,
  };
}

const ENCABEZADOS = [
  'TIPO DE PERSONA',
  'RUC',
  'DV',
  'NOMBRE O RAZON SOCIAL',
  'FACTURA',
  'FECHA',
  'CONCEPTO',
  'COMPRAS DE BIENES Y SERVICIOS',
  'MONTO EN BALBOAS',
  'ITBMS PAGADO EN BALBOAS',
];

/** .xlsx con las mismas columnas y orden que la consulta original, mas una hoja de pendientes. */
export function construirExcelInforme43(resultado) {
  const filas = resultado.filas.map((f) => {
    const [y, mo, d] = f.fecha.split('-').map(Number);
    return [
      f.tipoPersona,
      f.ruc,
      f.dv,
      f.nombre,
      f.factura,
      // Numero de serie de Excel (dias desde 1899-12-30): un Date se corria un
      // dia por la zona horaria del servidor (01/10 salia 30/09).
      (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000,
      f.concepto,
      f.comprasBienesServicios,
      f.monto,
      f.itbms,
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas]);
  ws['!cols'] = [10, 18, 6, 40, 16, 12, 10, 14, 16, 16].map((wch) => ({ wch }));
  // RUC, DV y factura como texto (no numero), para no perder ceros ni guiones.
  for (let r = 1; r <= filas.length; r++) {
    for (const c of [1, 2, 4]) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda) celda.t = 's';
    }
    const fecha = ws[XLSX.utils.encode_cell({ r, c: 5 })];
    if (fecha) fecha.z = 'dd/mm/yyyy';
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Informe 43');

  if (resultado.proveedoresIncompletos.length || resultado.cuentasSinConcepto.length) {
    const pendientes = [
      ['Proveedores con datos incompletos (completar en QuickBooks)'],
      ['Proveedor', 'Falta', 'Transacciones'],
      ...resultado.proveedoresIncompletos.map((p) => [p.nombre, p.faltan.join(', '), p.transacciones]),
      [],
      ['Cuentas sin concepto (no incluidas en el informe)'],
      ['Cuenta', 'Monto', 'Lineas'],
      ...resultado.cuentasSinConcepto.map((c) => [`${c.numero} ${c.nombre}`.trim(), c.monto, c.lineas]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pendientes), 'Pendientes');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
