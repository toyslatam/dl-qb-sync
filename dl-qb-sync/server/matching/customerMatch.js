import { getAllCustomers } from '../integrations/quickbooks.js';
import { clearCustomerIndex, upsertCustomerIndex, findQbCustomer } from '../db/store.js';

/** El ID de paciente de Dentalink vive en el campo real "Suffix" del Customer en QuickBooks. */
export function extractDentalinkId(customer) {
  const suffix = customer?.Suffix?.trim();
  return suffix || null;
}

/** Reconstruye el indice local id_dentalink -> qb_customer_id leyendo todos los Customers de QBO. */
export async function refreshCustomerIndex() {
  const customers = await getAllCustomers();
  await clearCustomerIndex();
  let indexed = 0;
  for (const customer of customers) {
    const idDentalink = extractDentalinkId(customer);
    if (idDentalink) {
      await upsertCustomerIndex(idDentalink, customer.Id, customer.DisplayName);
      indexed += 1;
    }
  }
  return { total: customers.length, indexed };
}

/** Devuelve { qbCustomerId, qbDisplayName } o null si el paciente no matchea con ningun Customer. */
export function matchCustomer(idPaciente) {
  return findQbCustomer(String(idPaciente));
}
