import { getPagos, getPaciente } from '../integrations/dentalink.js';
import { createCustomer, updateCustomer, getCustomerById, searchCustomers } from '../integrations/quickbooks.js';
import { matchCustomer, refreshCustomerIndex } from '../matching/customerMatch.js';
import { upsertCustomerIndex } from '../db/store.js';

/** Fecha de hoy en hora de Panama (UTC-5 fijo, sin horario de verano). */
function hoyPanama() {
  const PANAMA_OFFSET_MS = -5 * 60 * 60 * 1000;
  return new Date(Date.now() + PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Lo que separa una cedula (aunque venga con guiones, ej. "8-344-34") de un
 * pasaporte/permiso de extranjero (ej. "E-8-109609", "PE-...", "YB5149452")
 * es si tiene alguna letra -- los guiones por si solos NO cuentan.
 */
function tieneLetras(texto) {
  return /[a-zA-Z]/.test(texto ?? '');
}

/**
 * Arma el Customer completo a partir de un paciente de Dentalink, replicando
 * el flujo de Power Automate ya en uso. El RUT puede ser una cedula (solo
 * numeros, con o sin guiones) o un pasaporte/permiso de extranjero (con letras):
 *  - Cedula: va completa (con guiones y todo) en AlternatePhone ("Otro" en QuickBooks).
 *  - Pasaporte: solo los digitos en AlternatePhone, y el valor completo
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
    if (tieneLetras(rut)) {
      payload.AlternatePhone = { FreeFormNumber: rut.replace(/\D/g, '') };
      payload.CompanyName = `${nombre} ${apellidos}Pass: ${rut}`;
    } else {
      payload.AlternatePhone = { FreeFormNumber: rut };
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
  agregarSiFalta(existente.AlternatePhone?.FreeFormNumber, 'AlternatePhone', completo.AlternatePhone);
  agregarSiFalta(existente.CompanyName, 'CompanyName', completo.CompanyName);

  // BillAddr tiene dos sub-campos (Ciudad, Direccion) -- se completan por
  // separado, no todo-o-nada, para no dejar la direccion vacia para siempre
  // solo porque la ciudad ya estaba puesta (o viceversa).
  if (completo.BillAddr) {
    const faltaCity = !existente.BillAddr?.City && completo.BillAddr.City;
    const faltaLine1 = !existente.BillAddr?.Line1 && completo.BillAddr.Line1;
    if (faltaCity || faltaLine1) {
      payload.BillAddr = {
        City: existente.BillAddr?.City || completo.BillAddr.City || '',
        Line1: existente.BillAddr?.Line1 || completo.BillAddr.Line1 || '',
      };
      hayCambios = true;
    }
  }

  return hayCambios ? payload : null;
}

function esErrorNombreDuplicado(err) {
  return err.message.includes('"code":"6240"');
}

/** QuickBooks a veces guarda nombres con doble espacio (GivenName+FamilyName concatenados). */
function normalizarEspacios(texto) {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * El paciente no matcheo por Suffix, pero QuickBooks rechazo la creacion
 * porque ya existe un Customer con exactamente ese mismo nombre -- suele
 * pasar con clientes creados antes de que existiera este flujo, sin el
 * Suffix puesto. En vez de fallar, se busca por nombre, y si hay exactamente
 * un candidato SIN Suffix (es decir, sin dueño todavia) se vincula y se
 * completan sus campos vacios.
 *
 * Si el candidato ya tiene un Suffix (esta vinculado a OTRO paciente de
 * Dentalink), no se toca: sería un homonimo, y vincularlo igual atribuiria
 * los pagos de este paciente al Customer de otra persona. Queda para
 * revision manual en vez de arriesgar un cruce de datos entre pacientes.
 */
async function vincularExistentePorNombre(idPaciente, paciente, payloadDeseado) {
  const candidatos = await searchCustomers(payloadDeseado.DisplayName);
  const exactos = candidatos.filter((c) => normalizarEspacios(c.DisplayName) === normalizarEspacios(payloadDeseado.DisplayName));
  if (exactos.length !== 1) {
    throw new Error(
      `Nombre duplicado en QuickBooks y no se pudo vincular automaticamente ` +
        `(${exactos.length} candidatos para "${payloadDeseado.DisplayName}")`
    );
  }

  const existente = exactos[0];
  if (existente.Suffix && existente.Suffix !== payloadDeseado.Suffix) {
    throw new Error(
      `Existe un Customer "${payloadDeseado.DisplayName}" pero ya esta vinculado a otro paciente de Dentalink ` +
        `(id ${existente.Suffix}) -- posible homonimo, requiere revision manual.`
    );
  }

  const payload = payloadSoloFaltantes(existente, paciente) ?? { Id: existente.Id, SyncToken: existente.SyncToken };
  if (!existente.Suffix) payload.Suffix = payloadDeseado.Suffix;
  await updateCustomer(payload);
  await upsertCustomerIndex(idPaciente, existente.Id, existente.DisplayName);
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

  const resultado = { pacientesRevisados: idsUnicos.length, creados: 0, actualizados: 0, vinculados: 0, sinCambios: 0, errores: [] };

  for (const idPaciente of idsUnicos) {
    try {
      const paciente = await getPaciente(idPaciente);
      const match = await matchCustomer(idPaciente);

      if (!match) {
        const payload = payloadCompleto(paciente);
        try {
          const created = await createCustomer(payload);
          await upsertCustomerIndex(idPaciente, created.Customer.Id, payload.DisplayName);
          resultado.creados += 1;
        } catch (err) {
          if (!esErrorNombreDuplicado(err)) throw err;
          await vincularExistentePorNombre(idPaciente, paciente, payload);
          resultado.vinculados += 1;
        }
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
