import 'dotenv/config';
import fetch from 'node-fetch';

const BASE_URL = (process.env.DENTALINK_BASE_URL || '').trim();
// Acepta el valor tanto si en .env viene solo el token como si ya incluye el
// prefijo "Token " (evita duplicarlo al armar el header, que causaba 401).
const RAW_TOKEN = (process.env.DENTALINK_TOKEN || '').trim();
const TOKEN = RAW_TOKEN.replace(/^Token\s+/i, '');

async function dentalinkFetch(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Token ${TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Dentalink GET ${url.pathname} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Dentalink filtra con ?q={"campo":{"operador":"valor"}}, no con query params sueltos. */
function buildUrl(path, query) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query && Object.keys(query).length > 0) {
    url.searchParams.set('q', JSON.stringify(query));
  }
  return url;
}

async function dentalinkGetOne(path, query) {
  const body = await dentalinkFetch(buildUrl(path, query));
  return body.data ?? body;
}

/** Dentalink pagina por cursor: sigue links.next hasta que ya no venga. */
async function dentalinkGetAllPages(path, query) {
  const items = [];
  let body = await dentalinkFetch(buildUrl(path, query));
  if (Array.isArray(body.data)) items.push(...body.data);

  while (body.links?.next) {
    body = await dentalinkFetch(new URL(body.links.next));
    if (Array.isArray(body.data)) items.push(...body.data);
  }
  return items;
}

export function getPaciente(idPaciente) {
  return dentalinkGetOne(`/pacientes/${idPaciente}`);
}

export function getPrestaciones() {
  return dentalinkGetAllPages('/prestaciones');
}

export function getPrestacion(idPrestacion) {
  return dentalinkGetOne(`/prestaciones/${idPrestacion}`);
}

function rangoFecha(campo, fechaDesde, fechaHasta) {
  const filtro = {};
  if (fechaDesde) filtro.gte = fechaDesde;
  if (fechaHasta) filtro.lte = fechaHasta;
  return Object.keys(filtro).length ? { [campo]: filtro } : undefined;
}

/**
 * Documentos tributarios (boletas/facturas) emitidos en un rango de fechas.
 * OJO: este modulo no esta activo en todas las cuentas de Dentalink. Si no
 * esta contratado, usar getPagos()/getPagosByPaciente() como disparador y
 * getTratamientosByPaciente()/getDetalleTratamiento() para las prestaciones.
 */
export function getDocumentosTributarios({ fechaDesde, fechaHasta } = {}) {
  return dentalinkGetAllPages('/documentosTributarios', rangoFecha('fecha_emision', fechaDesde, fechaHasta));
}

/** Pagos recibidos en un rango de fechas (todos los pacientes). */
export function getPagos({ fechaDesde, fechaHasta } = {}) {
  return dentalinkGetAllPages('/pagos', rangoFecha('fecha_recepcion', fechaDesde, fechaHasta));
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
