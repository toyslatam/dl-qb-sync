import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Cliente con Service Role: corre solo en el backend, bypassa RLS.
// Nunca exponer SUPABASE_SERVICE_ROLE_KEY al frontend.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function assertOk(error, context) {
  if (error) throw new Error(`Supabase error (${context}): ${error.message}`);
}

export async function upsertCustomerIndex(idDentalink, qbCustomerId, qbDisplayName) {
  const { error } = await supabase.from('customer_index').upsert({
    id_dentalink: String(idDentalink),
    qb_customer_id: qbCustomerId,
    qb_display_name: qbDisplayName,
    updated_at: new Date().toISOString(),
  });
  assertOk(error, 'upsertCustomerIndex');
}

/** Version en lote de upsertCustomerIndex: un solo viaje de red en vez de uno por cliente. */
export async function upsertCustomerIndexBulk(rows) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('customer_index').upsert(
    rows.map((r) => ({
      id_dentalink: String(r.idDentalink),
      qb_customer_id: r.qbCustomerId,
      qb_display_name: r.qbDisplayName,
      updated_at: now,
    }))
  );
  assertOk(error, 'upsertCustomerIndexBulk');
}

export async function findQbCustomer(idDentalink) {
  const { data, error } = await supabase
    .from('customer_index')
    .select('qb_customer_id, qb_display_name')
    .eq('id_dentalink', String(idDentalink))
    .maybeSingle();
  assertOk(error, 'findQbCustomer');
  return data ? { qbCustomerId: data.qb_customer_id, qbDisplayName: data.qb_display_name } : null;
}

export async function upsertItemIndex(prestacionKey, qbItemId, qbItemName) {
  const { error } = await supabase.from('item_index').upsert({
    prestacion_key: prestacionKey,
    qb_item_id: qbItemId,
    qb_item_name: qbItemName,
    updated_at: new Date().toISOString(),
  });
  assertOk(error, 'upsertItemIndex');
}

/** Version en lote de upsertItemIndex: un solo viaje de red en vez de uno por item. */
export async function upsertItemIndexBulk(rows) {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('item_index').upsert(
    rows.map((r) => ({
      prestacion_key: r.prestacionKey,
      qb_item_id: r.qbItemId,
      qb_item_name: r.qbItemName,
      updated_at: now,
    }))
  );
  assertOk(error, 'upsertItemIndexBulk');
}

export async function findQbItemId(prestacionKey) {
  const { data, error } = await supabase
    .from('item_index')
    .select('qb_item_id')
    .eq('prestacion_key', prestacionKey)
    .maybeSingle();
  assertOk(error, 'findQbItemId');
  return data?.qb_item_id ?? null;
}

export async function clearCustomerIndex() {
  const { error } = await supabase.from('customer_index').delete().not('id_dentalink', 'is', null);
  assertOk(error, 'clearCustomerIndex');
}

export async function clearItemIndex() {
  const { error } = await supabase.from('item_index').delete().not('prestacion_key', 'is', null);
  assertOk(error, 'clearItemIndex');
}

export async function isInvoiceSynced(idPago) {
  const { data, error } = await supabase
    .from('synced_invoices')
    .select('id_pago')
    .eq('id_pago', String(idPago))
    .maybeSingle();
  assertOk(error, 'isInvoiceSynced');
  return Boolean(data);
}

export async function markInvoiceSynced(idPago, qbInvoiceId) {
  const { error } = await supabase.from('synced_invoices').upsert({
    id_pago: String(idPago),
    qb_invoice_id: String(qbInvoiceId),
    synced_at: new Date().toISOString(),
  });
  assertOk(error, 'markInvoiceSynced');
}

/** Quita la marca de sincronizado (para poder revertir un marcado manual por error). */
export async function unmarkInvoiceSynced(idPago) {
  const { error } = await supabase.from('synced_invoices').delete().eq('id_pago', String(idPago));
  assertOk(error, 'unmarkInvoiceSynced');
}

export async function upsertDraft(idPago, idPaciente, draft) {
  const { error } = await supabase.from('review_queue').upsert({
    id_pago: String(idPago),
    id_paciente: idPaciente ? String(idPaciente) : null,
    draft,
    resolved: false,
  });
  assertOk(error, 'upsertDraft');
}

export async function getDraft(idPago) {
  const { data, error } = await supabase
    .from('review_queue')
    .select('*')
    .eq('id_pago', String(idPago))
    .maybeSingle();
  assertOk(error, 'getDraft');
  return data;
}

export async function getPendingDrafts() {
  const { data, error } = await supabase
    .from('review_queue')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  assertOk(error, 'getPendingDrafts');
  return data ?? [];
}

export async function resolveReviewItem(idPago) {
  const { error } = await supabase.from('review_queue').update({ resolved: true }).eq('id_pago', String(idPago));
  assertOk(error, 'resolveReviewItem');
}

/** Guarda valores sueltos que deben sobrevivir reinicios (ej. el refresh_token vigente de QuickBooks). */
export async function setSetting(key, value) {
  const { error } = await supabase.from('oauth_tokens').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  assertOk(error, 'setSetting');
}

export async function getSetting(key) {
  const { data, error } = await supabase.from('oauth_tokens').select('value').eq('key', key).maybeSingle();
  assertOk(error, 'getSetting');
  return data?.value ?? null;
}

export default supabase;
