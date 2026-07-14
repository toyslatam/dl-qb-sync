import 'dotenv/config';
import { getAllItems, updateItem } from '../integrations/quickbooks.js';

// Corrige en QuickBooks todos los Items de servicio que no tengan el codigo
// de impuesto por defecto (Exempt/0%), para que las facturas no fallen con
// "asegurate de que todas las transacciones tengan una tasa impositiva".
// Uso: node server/sync/fixItemTaxCodes.js

const TAX_CODE_ID = process.env.QBO_TAX_CODE_ID || '7';
const DELAY_MS = 250; // pausa entre llamadas para no golpear el limite de rate de QBO

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const items = await getAllItems();
  const pendientes = items.filter(
    (i) => (i.Type === 'Service' || i.Type === 'NonInventory') && i.SalesTaxCodeRef?.value !== TAX_CODE_ID
  );

  console.log(`Total items de servicio: ${items.length}`);
  console.log(`Sin codigo ${TAX_CODE_ID} configurado: ${pendientes.length}`);

  let ok = 0;
  let fallidos = 0;

  for (const item of pendientes) {
    try {
      await updateItem({
        Id: item.Id,
        SyncToken: item.SyncToken,
        Taxable: false,
        SalesTaxCodeRef: { value: TAX_CODE_ID },
      });
      ok += 1;
      console.log(`[${ok + fallidos}/${pendientes.length}] OK: ${item.Name}`);
    } catch (err) {
      fallidos += 1;
      console.error(`[${ok + fallidos}/${pendientes.length}] FALLO: ${item.Name} -> ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nListo. Actualizados: ${ok}. Fallidos: ${fallidos}.`);
}

main().catch((err) => {
  console.error('Error general:', err);
  process.exit(1);
});
