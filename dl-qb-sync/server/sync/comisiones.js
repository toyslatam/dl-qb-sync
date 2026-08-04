import XLSX from 'xlsx';
import { getInvoicesByDateRange } from '../integrations/quickbooks.js';
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
export async function calcularComisiones({ fechaDesde, fechaHasta }) {
  const [invoices, doctores, metodosPago, residuales] = await Promise.all([
    getInvoicesByDateRange(fechaDesde, fechaHasta),
    getDoctores(),
    getMetodosPagoDescuento(),
    getResiduales(),
  ]);

  const doctoresPorClave = new Map(doctores.map((d) => [`${normalizar(d.nombre)}|${normalizar(d.apellido)}`, d]));
  const descuentoPorMedio = new Map(metodosPago.map((m) => [m.medio_pago, m.porcentaje]));

  const filas = [];
  const sinIdentificar = [];

  for (const inv of invoices) {
    const memo = inv.CustomerMemo?.value ?? '';
    const { nombre, apellido } = separarNombreApellido(memo);
    const doctor = doctoresPorClave.get(`${normalizar(nombre)}|${normalizar(apellido)}`);

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

    const descuentoPct = descuentoPorMedio.get(medioPago) ?? 0;
    const descMP = totalAsociado * descuentoPct;
    const laboratorios = 0; // fase posterior: QuickBooks #2, cuenta 5200
    const base = totalAsociado - descMP - laboratorios;
    const comisionPct = doctor.comision_pct;
    const comisionAPagar = base * comisionPct;

    filas.push({
      nombreProfesional: doctor.nombre,
      apellidosProfesional: doctor.apellido,
      especialidad: doctor.especialidad,
      numeroPago: inv.DocNumber,
      fechaRecepcionPago: inv.TxnDate,
      nombrePaciente: pacienteNombreSep,
      apellidosPaciente: pacienteApellidoSep,
      medioPago,
      doctor: `${doctor.titulo} ${doctor.nombre} ${doctor.apellido}`,
      totalAsociado,
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

  return { filas, resumen, sinIdentificar, totalGeneral, facturasEncontradas: invoices.length };
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsCalculo, 'ArchivoCalculo');
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
  XLSX.utils.book_append_sheet(wb, wsSinIdentificar, 'Sin identificar');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
