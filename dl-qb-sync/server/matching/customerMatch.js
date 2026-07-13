import 'dotenv/config';
import { getAllCustomers } from '../integrations/quickbooks.js';
import { clearCustomerIndex, upsertCustomerIndex, findQbCustomer } from '../db/store.js';

const SUFFIX_PREFIX = process.env.DL_CUSTOMER_SUFFIX_PREFIX || 'DL';
// Matchea nombres tipo "Juan Perez - DL12345" (case-insensitive, espacios flexibles).
const SUFFIX_REGEX = new RegExp(`-\\s*${SUFFIX_PREFIX}\\s*([0-9]+)\\s*$`, 'i');

export function extractDentalinkId(displayName) {
  const match = displayName?.match(SUFFIX_REGEX);
  return match ? match[1] : null;
}

export function buildSuffixedName(baseName, idDentalink) {
  return `${baseName} - ${SUFFIX_PREFIX}${idDentalink}`;
}

/** Reconstruye el indice local id_dentalink -> qb_customer_id leyendo todos los Customers de QBO. */
export async function refreshCustomerIndex() {
  const customers = await getAllCustomers();
  await clearCustomerIndex();
  let indexed = 0;
  for (const customer of customers) {
    const idDentalink = extractDentalinkId(customer.DisplayName);
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
