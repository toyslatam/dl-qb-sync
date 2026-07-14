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

/** Devuelve { qbCustomerId, qbDisplayName } o null si el paciente no matchea con ningun Customer. */
export function matchCustomer(idPaciente) {
  return findQbCustomer(String(idPaciente));
}
