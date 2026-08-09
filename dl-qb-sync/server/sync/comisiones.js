import XLSX from 'xlsx';
import { getInvoicesByDateRange, getCostosOperativos } from '../integrations/quickbooks.js';
import { getDoctores, getMetodosPagoDescuento, getResiduales } from '../db/store.js';

/** Separa "Francisco SousaLennox" en { nombre: 'Francisco', apellido: 'SousaLennox' } (primer espacio). */
function separarNombreApellido(texto) {
  const limpio = (texto ?? '').trim().replace(/\s+/g, ' ');
  const espacio = limpio.indexOf(' ');
  if (espacio === -1) return { nombre: limpio, apellido: '' };
  return { nombre: limpio.slice(0, espacio), apellido: limpio.slice(espacio + 1) };
}

function normalizar(texto) {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Calcula la tabla de comisiones (equivalente a ArchivoCalculo) para un rango
 * de fechas, leyendo SOLO de QuickBooks (facturas ya creadas) + los catalogos
 * de Doctores/Master/Residuales en Supabase. No escribe nada en QuickBooks.
 */
export async function calcularComisiones({
  fechaDesde,
  fechaHasta,
  asignacionesLaboratorio = {},
  asignacionesInsumos = {},
  asignacionesDoctor = {},
}) {
  const [invoices, doctores, metodosPago, residuales] = await Promise.all([
    getInvoicesByDateRange(fechaDesde, fechaHasta),
    getDoctores(),
    getMetodosPagoDescuento(),
    getResiduales(),
  ]);

  // Si QuickBooks no responde por lo que sea, el reporte sigue funcionando
  // con Laboratorios/Insumos en $0 en vez de fallar por completo.
  let costosLaboratorio = [];
  let costosInsumos = [];
  let costosError = null;
  try {
    ({ laboratorio: costosLaboratorio, insumos: costosInsumos } = await getCostosOperativos(fechaDesde, fechaHasta));
  } catch (err) {
    costosError = err.message;
  }
  // Indice estable dentro de este calculo, para que el frontend pueda decir
  // "el costo #3 va a la factura X" sin depender de IDs internos de QBO.
  costosLaboratorio = costosLaboratorio.map((c, i) => ({ ...c, indice: i }));
  costosInsumos = costosInsumos.map((c, i) => ({ ...c, indice: i }));

  function armarIndicesDeCosto(costos, asignaciones) {
    const porPaciente = new Map();
    for (const costo of costos) {
      const clave = normalizar(costo.paciente);
      if (!clave) continue;
      porPaciente.set(clave, (porPaciente.get(clave) ?? 0) + costo.monto);
    }
    // idFactura (string) -> suma de costos asignados a mano.
    const manualPorFactura = new Map();
    for (const [indiceStr, idFactura] of Object.entries(asignaciones)) {
      const costo = costos[Number(indiceStr)];
      if (!costo || !idFactura) continue;
      manualPorFactura.set(String(idFactura), (manualPorFactura.get(String(idFactura)) ?? 0) + costo.monto);
    }
    const asignadosManualmente = new Set(Object.keys(asignaciones).map(Number));
    return { porPaciente, manualPorFactura, asignadosManualmente, usado: new Set() };
  }

  const lab = armarIndicesDeCosto(costosLaboratorio, asignacionesLaboratorio);
  const insumos = armarIndicesDeCosto(costosInsumos, asignacionesInsumos);

  const doctoresPorClave = new Map(doctores.map((d) => [`${normalizar(d.nombre)}|${normalizar(d.apellido)}`, d]));
  const doctoresPorId = new Map(doctores.map((d) => [String(d.id), d]));
  const descuentoPorMedio = new Map(metodosPago.map((m) => [m.medio_pago, m.porcentaje]));

  // Primera pasada: arma las lineas base (una por prestacion/linea de la
  // factura, no una por factura -- una factura puede tener varias
  // prestaciones y cada una puede ser de un doctor distinto) y cuenta cuantas
  // facturas hay por paciente en el rango. Si un paciente aparece mas de una
  // vez, no se puede saber con certeza a cual factura pertenece un costo de
  // laboratorio -- en ese caso NO se asigna automaticamente (mejor dejarlo
  // para revision manual que adivinar mal en un numero que afecta la
  // comision de alguien), salvo que ya venga una asignacion manual explicita
  // para ese costo.
  const prefilas = [];
  const sinIdentificar = [];
  const conteoPorPaciente = new Map();

  for (const inv of invoices) {
    const memo = inv.CustomerMemo?.value ?? '';
    const { nombre, apellido } = separarNombreApellido(memo);
    // Doctor del encabezado (Nota para cliente): es la sugerencia por
    // defecto para cada linea, y tambien el que absorbe el costo de
    // Laboratorio completo de la factura (no se reparte entre lineas).
    const doctorEncabezado = doctoresPorClave.get(`${normalizar(nombre)}|${normalizar(apellido)}`) ?? null;

    const pacienteNombre = inv.CustomerRef?.name ?? '';
    const { nombre: pacienteNombreSep, apellido: pacienteApellidoSep } = separarNombreApellido(pacienteNombre);
    const medioPago = inv.PaymentMethodRef?.name ?? '';

    const lineasFactura = (inv.Line ?? []).filter((l) => l.DetailType === 'SalesItemLineDetail');
    if (lineasFactura.length === 0) continue;

    // Cada linea usa el doctor del encabezado por defecto, salvo que se haya
    // asignado manualmente un doctor distinto para esa linea puntual (cuando
    // una factura trae prestaciones de mas de un doctor).
    const lineasResueltas = lineasFactura.map((linea) => {
      const idLinea = String(linea.Id);
      const claveAsignacion = `${inv.Id}:${idLinea}`;
      const doctorManual = doctoresPorId.get(String(asignacionesDoctor[claveAsignacion] ?? ''));
      return {
        idLinea,
        doctor: doctorManual ?? doctorEncabezado,
        prestacion: linea.Description || linea.SalesItemLineDetail?.ItemRef?.name || '',
        monto: Number(linea.Amount ?? 0),
      };
    });

    for (const l of lineasResueltas) {
      if (l.doctor) continue;
      sinIdentificar.push({
        idFactura: inv.Id,
        idLinea: l.idLinea,
        docNumber: inv.DocNumber,
        fecha: inv.TxnDate,
        paciente: pacienteNombre,
        notaCliente: memo,
        prestacion: l.prestacion,
        total: l.monto,
      });
    }

    const lineasConDoctor = lineasResueltas.filter((l) => l.doctor);
    if (lineasConDoctor.length === 0) continue;

    const clavePaciente = normalizar(pacienteNombre);
    conteoPorPaciente.set(clavePaciente, (conteoPorPaciente.get(clavePaciente) ?? 0) + 1);

    // La linea que absorbe los costos de Laboratorio e Insumos de la
    // factura: la primera que quedo con el mismo doctor del encabezado (si
    // ninguna coincide, esos costos no se asignan en esta factura y quedan
    // pendientes de revision). Ambos costos se atribuyen a la misma linea,
    // nunca se reparten entre varias.
    const idLineaPrincipal = doctorEncabezado
      ? lineasConDoctor.find((l) => l.doctor === doctorEncabezado)?.idLinea ?? null
      : null;

    for (const l of lineasConDoctor) {
      prefilas.push({
        idFactura: inv.Id,
        idLinea: l.idLinea,
        doctor: l.doctor,
        docNumber: inv.DocNumber,
        txnDate: inv.TxnDate,
        pacienteNombre,
        pacienteNombreSep,
        pacienteApellidoSep,
        medioPago,
        totalAsociado: l.monto,
        prestacion: l.prestacion,
        clavePaciente,
        esLineaPrincipal: l.idLinea === idLineaPrincipal,
      });
    }
  }

  function costoDeFactura(indices, p) {
    const manual = indices.manualPorFactura.get(String(p.idFactura));
    const pacienteUnico = conteoPorPaciente.get(p.clavePaciente) === 1;
    const total = manual ?? (pacienteUnico ? indices.porPaciente.get(p.clavePaciente) ?? 0 : 0);
    const monto = p.esLineaPrincipal ? total : 0;
    if (monto) indices.usado.add(p.clavePaciente);
    return monto;
  }

  const filas = [];
  for (const p of prefilas) {
    const laboratorios = costoDeFactura(lab, p);
    const costoInsumos = costoDeFactura(insumos, p);

    const descuentoPct = descuentoPorMedio.get(p.medioPago) ?? 0;
    const descMP = p.totalAsociado * descuentoPct;
    const base = p.totalAsociado - descMP - laboratorios - costoInsumos;
    const comisionPct = p.doctor.comision_pct;
    const comisionAPagar = base * comisionPct;

    filas.push({
      idFactura: p.idFactura,
      idLinea: p.idLinea,
      nombreProfesional: p.doctor.nombre,
      apellidosProfesional: p.doctor.apellido,
      especialidad: p.doctor.especialidad,
      numeroPago: p.docNumber,
      fechaRecepcionPago: p.txnDate,
      nombrePaciente: p.pacienteNombreSep,
      apellidosPaciente: p.pacienteApellidoSep,
      medioPago: p.medioPago,
      doctor: `${p.doctor.titulo} ${p.doctor.nombre} ${p.doctor.apellido}`,
      doctorId: p.doctor.id,
      prestacion: p.prestacion,
      totalAsociado: p.totalAsociado,
      descuentoMetodoPagoPct: descuentoPct,
      descMP,
      laboratorios,
      insumos: costoInsumos,
      base,
      comisionPct,
      comisionAPagar,
      residualesOrtodoncia: 0,
      total: comisionAPagar,
    });
  }

  // Los residuales se suman aparte por doctor (no vienen de una factura puntual).
  const residualesPorDoctor = new Map();
  for (const r of residuales) {
    if (!r.doctores || r.pagado) continue;
    const descTC = Number(r.monto_residual) * Number(r.descuento_pct);
    const final = Number(r.monto_residual) - descTC;
    const paraPagar = final * Number(r.comision_pct);
    const clave = r.doctor_id;
    residualesPorDoctor.set(clave, (residualesPorDoctor.get(clave) ?? 0) + paraPagar);
  }

  const resumenPorDoctor = new Map();
  for (const fila of filas) {
    const clave = `${fila.nombreProfesional} ${fila.apellidosProfesional}`;
    resumenPorDoctor.set(clave, (resumenPorDoctor.get(clave) ?? 0) + fila.comisionAPagar);
  }
  for (const doctor of doctores) {
    const residual = residualesPorDoctor.get(doctor.id);
    if (!residual) continue;
    const clave = `${doctor.nombre} ${doctor.apellido}`;
    resumenPorDoctor.set(clave, (resumenPorDoctor.get(clave) ?? 0) + residual);
  }

  const resumen = [...resumenPorDoctor.entries()]
    .map(([doctorNombre, total]) => ({ doctor: doctorNombre, total }))
    .sort((a, b) => b.total - a.total);

  const totalGeneral = resumen.reduce((sum, r) => sum + r.total, 0);

  // Costos que quedan pendientes de revisar a mano: su paciente no matcheo
  // ninguna factura, tenia mas de una factura en el rango (ambiguo), o
  // simplemente no se le asigno todavia manualmente.
  function pendientes(costos, indices) {
    return costos.filter((c) => !indices.asignadosManualmente.has(c.indice) && !indices.usado.has(normalizar(c.paciente)));
  }
  const laboratoriosPendientes = pendientes(costosLaboratorio, lab);
  const insumosPendientes = pendientes(costosInsumos, insumos);

  return {
    filas,
    resumen,
    sinIdentificar,
    costosLaboratorio,
    laboratoriosPendientes,
    costosInsumos,
    insumosPendientes,
    costosError,
    totalGeneral,
    facturasEncontradas: invoices.length,
    doctoresDisponibles: doctores.map((d) => ({ id: d.id, titulo: d.titulo, nombre: d.nombre, apellido: d.apellido })),
  };
}

const ENCABEZADOS = [
  'Nombre Profesional Tratamiento',
  'Apellidos Profesional Tratamiento',
  'Especialidad',
  '# Pago',
  'Fecha de recepción del pago',
  'Nombre Paciente',
  'Apellidos Paciente',
  'Medio de pago',
  'Doctor',
  'Total asociado a tratamiento',
  '% Descuento Metodo Pago',
  'Desc MP',
  'Laboratorios',
  'Insumos Médicos',
  'BASE',
  '% Comision',
  'COMISION A PAGAR',
  'RESIDUALES ORTODONCIA',
  'TOTAL',
];

/** Arma el .xlsx descargable, mismas columnas que ArchivoCalculo del Excel original. */
export function construirExcelComisiones(resultado) {
  const filasHoja = resultado.filas.map((f) => [
    f.nombreProfesional,
    f.apellidosProfesional,
    f.especialidad,
    f.numeroPago,
    f.fechaRecepcionPago,
    f.nombrePaciente,
    f.apellidosPaciente,
    f.medioPago,
    f.doctor,
    f.totalAsociado,
    f.descuentoMetodoPagoPct,
    f.descMP,
    f.laboratorios,
    f.insumos,
    f.base,
    f.comisionPct,
    f.comisionAPagar,
    f.residualesOrtodoncia,
    f.total,
  ]);

  const wsCalculo = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filasHoja]);
  const wsResumen = XLSX.utils.aoa_to_sheet([
    ['DOCTOR', 'TOTAL'],
    ...resultado.resumen.map((r) => [r.doctor, r.total]),
    ['TOTAL GENERAL', resultado.totalGeneral],
  ]);
  const wsSinIdentificar = XLSX.utils.aoa_to_sheet([
    ['# Factura', 'Fecha', 'Paciente', 'Prestación', 'Nota para cliente', 'Total'],
    ...resultado.sinIdentificar.map((s) => [s.docNumber, s.fecha, s.paciente, s.prestacion, s.notaCliente, s.total]),
  ]);
  const wsLaboratorios = XLSX.utils.aoa_to_sheet([
    ['# Factura Proveedor', 'Fecha', 'Proveedor', 'Paciente', 'Doctor', 'Monto'],
    ...resultado.laboratoriosPendientes.map((l) => [l.numero, l.fecha, l.proveedor, l.paciente, l.doctorTexto, l.monto]),
  ]);
  const wsInsumos = XLSX.utils.aoa_to_sheet([
    ['# Factura Proveedor', 'Fecha', 'Proveedor', 'Paciente', 'Doctor', 'Monto'],
    ...resultado.insumosPendientes.map((l) => [l.numero, l.fecha, l.proveedor, l.paciente, l.doctorTexto, l.monto]),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCalculo, 'ArchivoCalculo');
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsSinIdentificar, 'Sin identificar');
  XLSX.utils.book_append_sheet(wb, wsLaboratorios, 'Laboratorios sin asociar');
  XLSX.utils.book_append_sheet(wb, wsInsumos, 'Insumos sin asociar');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
