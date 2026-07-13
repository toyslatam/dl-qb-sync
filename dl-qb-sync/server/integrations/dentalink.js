import 'dotenv/config';
import fetch from 'node-fetch';

const BASE_URL = process.env.DENTALINK_BASE_URL;
const TOKEN = process.env.DENTALINK_TOKEN;

async function dentalinkGet(path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Dentalink GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.data ?? body;
}

async function dentalinkGetAllPages(path, params = {}) {
  let page = 1;
  const items = [];
  // Dentalink pagina con ?page=N; se detiene cuando una pagina vuelve vacia.
  while (true) {
    const data = await dentalinkGet(path, { ...params, page });
    if (!Array.isArray(data) || data.length === 0) break;
    items.push(...data);
    page += 1;
  }
  return items;
}

export function getPaciente(idPaciente) {
  return dentalinkGet(`/pacientes/${idPaciente}`);
}

export function getPrestaciones() {
  return dentalinkGetAllPages('/prestaciones');
}

export function getPrestacion(idPrestacion) {
  return dentalinkGet(`/prestaciones/${idPrestacion}`);
}

/**
 * Documentos tributarios (boletas/facturas) emitidos en un rango de fechas.
 * OJO: este modulo no esta activo en todas las cuentas de Dentalink. Si no
 * esta contratado, usar getPagos()/getPagosByPaciente() como disparador y
 * getTratamientosByPaciente()/getDetalleTratamiento() para las prestaciones.
 */
export function getDocumentosTributarios({ fechaDesde, fechaHasta } = {}) {
  const filtros = {};
  if (fechaDesde) filtros['fecha_emision[gte]'] = fechaDesde;
  if (fechaHasta) filtros['fecha_emision[lte]'] = fechaHasta;
  return dentalinkGetAllPages('/documentosTributarios', filtros);
}

/** Pagos recibidos en un rango de fechas (todos los pacientes). */
export function getPagos({ fechaDesde, fechaHasta } = {}) {
  const filtros = {};
  if (fechaDesde) filtros['fecha_recepcion[gte]'] = fechaDesde;
  if (fechaHasta) filtros['fecha_recepcion[lte]'] = fechaHasta;
  return dentalinkGetAllPages('/pagos', filtros);
}

/** Pagos de un paciente especifico (modo de prueba con un solo paciente). */
export function getPagosByPaciente(idPaciente) {
  return dentalinkGetAllPages(`/pacientes/${idPaciente}/pagos`);
}

/** Planes de tratamiento de un paciente especifico. */
export function getTratamientosByPaciente(idPaciente) {
  return dentalinkGetAllPages(`/pacientes/${idPaciente}/tratamientos`);
}

export function getDetalleTratamiento(idTratamiento) {
  return dentalinkGetAllPages(`/tratamientos/${idTratamiento}/detalles`);
}
