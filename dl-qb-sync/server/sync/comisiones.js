import XLSX from 'xlsx';
import { getInvoicesByDateRange } from '../integrations/quickbooks.js';
import { getCostosLaboratorio } from '../integrations/quickbooks2.js';
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
export async function calcularComisiones({ fechaDesde, fechaHasta, asignacionesLaboratorio = {}, asignacionesDoctor = {} }) {
  const [invoices, doctores, metodosPago, residuales] = await Promise.all([
    getInvoicesByDateRange(fechaDesde, fechaHasta),
    getDoctores(),
    getMetodosPagoDescuento(),
    getResiduales(),
  ]);

  // QuickBooks #2 (laboratorios) es opcional: si todavia no esta conectado,
  // el reporte sigue funcionando con Laboratorios en $0 en vez de fallar.
  let costosLaboratorio = [];
  let laboratorioError = null;
  try {
    costosLaboratorio = await getCostosLaboratorio(fechaDesde, fechaHasta);
  } catch (err) {
    laboratorioError = err.message;
  }
  // Indice estable dentro de este calculo, para que el frontend pueda decir
  // "el costo #3 va a la factura X" sin depender de IDs internos de QBO.
  costosLaboratorio = costosLaboratorio.map((c, i) => ({ ...c, indice: i }));

  const laboratorioPorPaciente = new Map();
  for (const costo of costosLaboratorio) {
    const clave = normalizar(costo.paciente);
    if (!clave) continue;
    laboratorioPorPaciente.set(clave, (laboratorioPorPaciente.get(clave) ?? 0) + costo.monto);
  }
  // idFactura (string) -> suma de costos de laboratorio asignados a mano.
  const laboratorioManualPorFactura = new Map();
  for (const [indiceStr, idFactura] of Object.entries(asignacionesLaboratorio)) {
    const costo = costosLaboratorio[Number(indiceStr)];
    if (!costo || !idFactura) continue;
    laboratorioManualPorFactura.set(String(idFactura), (laboratorioManualPorFactura.get(String(idFactura)) ?? 0) + costo.monto);
  }
  const indicesAsignadosManualmente = new Set(Object.keys(asignacionesLaboratorio).map(Number));
  const laboratorioUsado = new Set();

  const doctoresPorClave = new Map(doctores.map((d) => [`${normalizar(d.nombre)}|${normalizar(d.apellido)}`, d]));
  const doctoresPorId = new Map(doctores.map((d) => [String(d.id), d]));
  const descuentoPorMedio = new Map(metodosPago.map((m) => [m.medio_pago, m.porcentaje]));

  // Primera pasada: arma las lineas base y cuenta cuantas facturas hay por
  // paciente en el rango. Si un paciente aparece mas de una vez, no se puede
  // saber con certeza a cual factura pertenece un costo de laboratorio -- en
  // ese caso NO se asigna automaticamente (mejor dejarlo para revision manual
  // que adivinar mal en un numero que afecta la comision de alguien), salvo
  // que ya venga una asignacion manual explicita para ese costo.
  const prefilas = [];
  const sinIdentificar = [];
  const conteoPorPaciente = new Map();

  for (const inv of invoices) {
    const memo = inv.CustomerMemo?.value ?? '';
    const { nombre, apellido } = separarNombreApellido(memo);
    const doctorAsignadoManual = doctoresPorId.get(String(asignacionesDoctor[inv.Id] ?? ''));
    const doctor = doctorAsignadoManual ?? doctoresPorClave.get(`${normalizar(nombre)}|${normalizar(apellido)}`);

    const pacienteNombre = inv.CustomerRef?.name ?? '';
    const { nombre: pacienteNombreSep, apellido: pacienteApellidoSep } = separarNombreApellido(pacienteNombre);
    const medioPago = inv.PaymentMethodRef?.name ?? '';
    const totalAsociado = Number(inv.TotalAmt ?? 0);

    if (!doctor) {
      sinIdentificar.push({
        idFactura: inv.Id,
        docNumber: inv.DocNumber,
        fecha: inv.TxnDate,
        paciente: pacienteNombre,
        notaCliente: memo,
        total: totalAsociado,
      });
      continue;
    }

    const clavePaciente = normalizar(pacienteNombre);
    conteoPorPaciente.set(clavePaciente, (conteoPorPaciente.get(clavePaciente) ?? 0) + 1);

    prefilas.push({
      idFactura: inv.Id,
      doctor,
      docNumber: inv.DocNumber,
      txnDate: inv.TxnDate,
      pacienteNombre,
      pacienteNombreSep,
      pacienteApellidoSep,
      medioPago,
      totalAsociado,
      clavePaciente,
    });
  }

  const filas = [];
  for (const p of prefilas) {
    const manual = laboratorioManualPorFactura.get(String(p.idFactura));
    const pacienteUnico = conteoPorPaciente.get(p.clavePaciente) === 1;
    const laboratorios = manual ?? (pacienteUnico ? laboratorioPorPaciente.get(p.clavePaciente) ?? 0 : 0);
    if (laboratorios) laboratorioUsado.add(p.clavePaciente);

    const descuentoPct = descuentoPorMedio.get(p.medioPago) ?? 0;
    const descMP = p.totalAsociado * descuentoPct;
    const base = p.totalAsociado - descMP - laboratorios;
    const comisionPct = p.doctor.comision_pct;
    const comisionAPagar = base * comisionPct;

    filas.push({
      idFactura: p.idFactura,
      nombreProfesional: p.doctor.nombre,
      apellidosProfesional: p.doctor.apellido,
      especialidad: p.doctor.especialidad,
      numeroPago: p.docNumber,
      fechaRecepcionPago: p.txnDate,
      nombrePaciente: p.pacienteNombreSep,
      apellidosPaciente: p.pacienteApellidoSep,
      medioPago: p.medioPago,
      doctor: `${p.doctor.titulo} ${p.doctor.nombre} ${p.doctor.apellido}`,
      totalAsociado: p.totalAsociado,
      descuentoMetodoPagoPct: descuentoPct,
      descMP,
      laboratorios,
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

  // Costos de laboratorio que quedan pendientes de revisar a mano: su
  // paciente no matcheo ninguna factura, tenia mas de una factura en el
  // rango (ambiguo), o simplemente no se le asigno todavia manualmente.
  const laboratoriosPendientes = costosLaboratorio.filter(
    (c) => !indicesAsignadosManualmente.has(c.indice) && !laboratorioUsado.has(normalizar(c.paciente))
  );

  return {
    filas,
    resumen,
    sinIdentificar,
    costosLaboratorio,
    laboratoriosPendientes,
    laboratorioError,
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
    ['# Factura', 'Fecha', 'Paciente', 'Nota para cliente', 'Total'],
    ...resultado.sinIdentificar.map((s) => [s.docNumber, s.fecha, s.paciente, s.notaCliente, s.total]),
  ]);
  const wsLaboratorios = XLSX.utils.aoa_to_sheet([
    ['# Factura Proveedor', 'Fecha', 'Proveedor', 'Paciente', 'Doctor', 'Monto'],
    ...resultado.laboratoriosPendientes.map((l) => [l.numero, l.fecha, l.proveedor, l.paciente, l.doctorTexto, l.monto]),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCalculo, 'ArchivoCalculo');
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsSinIdentificar, 'Sin identificar');
  XLSX.utils.book_append_sheet(wb, wsLaboratorios, 'Laboratorios sin asociar');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
