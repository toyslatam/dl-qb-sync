import { getAllItems } from '../integrations/quickbooks.js';
import { clearItemIndex, upsertItemIndexBulk, findQbItemId } from '../db/store.js';

/** Normaliza nombre/codigo para matchear sin importar tildes, mayusculas o espacios extra. */
export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/** Reconstruye el indice local prestacion_key -> qb_item_id leyendo todos los Items de QBO. */
export async function refreshItemIndex() {
  const items = await getAllItems();
  await clearItemIndex();

  // Map para deduplicar por prestacion_key (Postgres no acepta dos filas con
  // la misma clave en un solo upsert); si hay colision, se queda con la ultima.
  const porClave = new Map();
  let indexed = 0;
  for (const item of items) {
    if (item.Type !== 'Service' && item.Type !== 'NonInventory') continue;
    porClave.set(normalizeKey(item.Name), { prestacionKey: normalizeKey(item.Name), qbItemId: item.Id, qbItemName: item.Name });
    // Tambien indexar por Sku/codigo si existe, para matchear por codigo de prestacion.
    if (item.Sku) {
      porClave.set(normalizeKey(item.Sku), { prestacionKey: normalizeKey(item.Sku), qbItemId: item.Id, qbItemName: item.Name });
    }
    indexed += 1;
  }

  await upsertItemIndexBulk([...porClave.values()]);
  return { total: items.length, indexed };
}

/**
 * Intenta matchear una prestacion de Dentalink contra el indice de Items de QBO,
 * primero por codigo y luego por nombre. Devuelve null si no hay match limpio.
 */
export async function matchItem(prestacion) {
  if (prestacion.codigo) {
    const byCode = await findQbItemId(normalizeKey(prestacion.codigo));
    if (byCode) return byCode;
  }
  if (prestacion.nombre) {
    const byName = await findQbItemId(normalizeKey(prestacion.nombre));
    if (byName) return byName;
  }
  return null;
}
