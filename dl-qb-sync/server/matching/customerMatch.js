import { getAllCustomers } from '../integrations/quickbooks.js';
import { clearCustomerIndex, upsertCustomerIndexBulk, findQbCustomer } from '../db/store.js';

/** El ID de paciente de Dentalink vive en el campo real "Suffix" del Customer en QuickBooks. */
export function extractDentalinkId(customer) {
  const suffix = customer?.Suffix?.trim();
  return suffix || null;
}

/** Reconstruye el indice local id_dentalink -> qb_customer_id leyendo todos los Customers de QBO. */
export async function refreshCustomerIndex() {
  const customers = await getAllCustomers();
  await clearCustomerIndex();

  // Map para deduplicar por id_dentalink (Postgres no acepta dos filas con la
  // misma clave en un solo upsert); si hay colision, se queda con la ultima.
  const porId = new Map();
  for (const customer of customers) {
    const idDentalink = extractDentalinkId(customer);
    if (idDentalink) {
      porId.set(idDentalink, { idDentalink, qbCustomerId: customer.Id, qbDisplayName: customer.DisplayName });
    }
  }

  await upsertCustomerIndexBulk([...porId.values()]);
  return { total: customers.length, indexed: porId.size };
}

/**
 * Devuelve { qbCustomerId, qbDisplayName } o null si el paciente no matchea
 * con ningun Customer. Solo lee del indice local (customer_index en
 * Supabase) -- QuickBooks NO permite filtrar Customer por Suffix via query
 * ("property 'Suffix' is not queryable"), asi que no existe forma de buscar
 * un paciente puntual en vivo sin traer a todos los Customers. El indice se
 * mantiene al dia solo (cron de clientes a las 6:30pm, boton "Sincronizar",
 * runSyncCycle); si un paciente no esta ahi todavia, se asigna a mano desde
 * la cola de revision (buscar por nombre o crear cliente), como ya se hacia.
 */
export function matchCustomer(idPaciente) {
  return findQbCustomer(String(idPaciente));
}
