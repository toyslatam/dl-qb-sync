import { getPagos, getPaciente } from '../integrations/dentalink.js';
import { createCustomer, updateCustomer, getCustomerById } from '../integrations/quickbooks.js';
import { matchCustomer, refreshCustomerIndex } from '../matching/customerMatch.js';
import { upsertCustomerIndex } from '../db/store.js';

/** Fecha de hoy en hora de Panama (UTC-5 fijo, sin horario de verano). */
function hoyPanama() {
  const PANAMA_OFFSET_MS = -5 * 60 * 60 * 1000;
  return new Date(Date.now() + PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

function esNumerico(texto) {
  return /^\d+$/.test((texto ?? '').trim());
}

/**
 * Arma el Customer completo a partir de un paciente de Dentalink, replicando
 * el flujo de Power Automate ya en uso. El RUT puede ser una cedula (solo
 * numeros) o un pasaporte (con letras):
 *  - Cedula: va completa en AlternatePhone ("Otro" en QuickBooks).
 *  - Pasaporte: solo los digitos en AlternatePhone, y el pasaporte completo
 *    queda visible en CompanyName ("Razon social") como "{nombre} {apellidos}Pass: {rut}".
 */
function payloadCompleto(paciente) {
  const nombre = paciente.nombre ?? '';
  const apellidos = paciente.apellidos ?? '';
  const rut = (paciente.rut ?? '').trim();

  const payload = {
    DisplayName: `${nombre} ${apellidos}`.trim(),
    GivenName: nombre,
    FamilyName: apellidos,
    Suffix: String(paciente.id),
  };
  if (paciente.observaciones) payload.Notes = paciente.observaciones;
  if (paciente.email) payload.PrimaryEmailAddr = { Address: paciente.email };
  if (paciente.celular) payload.PrimaryPhone = { FreeFormNumber: paciente.celular };
  if (paciente.ciudad || paciente.direccion) {
    payload.BillAddr = { City: paciente.ciudad || '', Line1: paciente.direccion || '' };
  }
  if (rut) {
    if (esNumerico(rut)) {
      payload.AlternatePhone = { FreeFormNumber: rut };
    } else {
      payload.AlternatePhone = { FreeFormNumber: rut.replace(/\D/g, '') };
      payload.CompanyName = `${nombre} ${apellidos}Pass: ${rut}`;
    }
  }
  return payload;
}

/**
 * Para un Customer que ya existe, arma un payload sparse con SOLO los campos
 * que hoy estan vacios en QuickBooks (pedido explicito: nunca sobreescribir
 * algo que ya tenga un valor, aunque este desactualizado respecto a Dentalink).
 * Devuelve null si no falta nada.
 */
function payloadSoloFaltantes(existente, paciente) {
  const completo = payloadCompleto(paciente);
  const payload = { Id: existente.Id, SyncToken: existente.SyncToken };
  let hayCambios = false;

  const agregarSiFalta = (yaExiste, campo, valor) => {
    if (!yaExiste && valor !== undefined) {
      payload[campo] = valor;
      hayCambios = true;
    }
  };

  agregarSiFalta(existente.Notes, 'Notes', completo.Notes);
  agregarSiFalta(existente.PrimaryEmailAddr?.Address, 'PrimaryEmailAddr', completo.PrimaryEmailAddr);
  agregarSiFalta(existente.PrimaryPhone?.FreeFormNumber, 'PrimaryPhone', completo.PrimaryPhone);
  agregarSiFalta(existente.BillAddr?.Line1 || existente.BillAddr?.City, 'BillAddr', completo.BillAddr);
  agregarSiFalta(existente.AlternatePhone?.FreeFormNumber, 'AlternatePhone', completo.AlternatePhone);
  agregarSiFalta(existente.CompanyName, 'CompanyName', completo.CompanyName);

  return hayCambios ? payload : null;
}

/**
 * Crea o completa los Customers de QuickBooks para los pacientes que tuvieron
 * un pago en el rango dado (por defecto, hoy). Nunca borra ni sobreescribe un
 * campo que ya tenga algo escrito -- solo crea los que faltan del todo, y
 * rellena los campos vacios de los que ya existen.
 */
export async function sincronizarPacientesDelDia({ fechaDesde, fechaHasta } = {}) {
  const desde = fechaDesde || hoyPanama();
  const hasta = fechaHasta || hoyPanama();

  await refreshCustomerIndex();
  const pagos = await getPagos({ fechaDesde: desde, fechaHasta: hasta });
  const idsUnicos = [...new Set(pagos.map((p) => p.id_paciente))];

  const resultado = { pacientesRevisados: idsUnicos.length, creados: 0, actualizados: 0, sinCambios: 0, errores: [] };

  for (const idPaciente of idsUnicos) {
    try {
      const paciente = await getPaciente(idPaciente);
      const match = await matchCustomer(idPaciente);

      if (!match) {
        const payload = payloadCompleto(paciente);
        const created = await createCustomer(payload);
        await upsertCustomerIndex(idPaciente, created.Customer.Id, payload.DisplayName);
        resultado.creados += 1;
        continue;
      }

      const existente = await getCustomerById(match.qbCustomerId);
      if (!existente) {
        resultado.errores.push({ idPaciente, error: `Customer ${match.qbCustomerId} ya no existe en QuickBooks` });
        continue;
      }

      const payload = payloadSoloFaltantes(existente, paciente);
      if (payload) {
        await updateCustomer(payload);
        resultado.actualizados += 1;
      } else {
        resultado.sinCambios += 1;
      }
    } catch (err) {
      resultado.errores.push({ idPaciente, error: err.message });
    }
  }

  return resultado;
}
