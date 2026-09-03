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

// --- Catalogo de doctores (modulo de Comisiones) ---

export async function getDoctores() {
  const { data, error } = await supabase.from('doctores').select('*').order('apellido', { ascending: true });
  assertOk(error, 'getDoctores');
  return data ?? [];
}

/** Busca un doctor por nombre+apellido EXACTOS (como vienen en la Nota para cliente de la factura). */
export async function findDoctorPorNombre(nombre, apellido) {
  const { data, error } = await supabase
    .from('doctores')
    .select('*')
    .eq('nombre', nombre)
    .eq('apellido', apellido)
    .maybeSingle();
  assertOk(error, 'findDoctorPorNombre');
  return data ?? null;
}

/** Usado por "Mi Comision": encuentra el doctor vinculado al login de quien esta pidiendo el reporte. */
export async function findDoctorPorEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase.from('doctores').select('*').eq('user_email', email).maybeSingle();
  assertOk(error, 'findDoctorPorEmail');
  return data ?? null;
}

/** Manda el correo de invitacion de Supabase (el doctor pone su propia contraseña al primer login). */
export async function invitarUsuario(email) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(`Supabase error (invitarUsuario): ${error.message}`);
  return data;
}

export async function createDoctor(doctor) {
  const { data, error } = await supabase.from('doctores').insert(doctor).select().single();
  assertOk(error, 'createDoctor');
  return data;
}

export async function updateDoctor(id, cambios) {
  const { data, error } = await supabase
    .from('doctores')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  assertOk(error, 'updateDoctor');
  return data;
}

export async function deleteDoctor(id) {
  const { error } = await supabase.from('doctores').delete().eq('id', id);
  assertOk(error, 'deleteDoctor');
}

// --- Tabla Master: % de descuento por medio de pago (modulo de Comisiones) ---

export async function getMetodosPagoDescuento() {
  const { data, error } = await supabase.from('metodos_pago_descuento').select('*').order('medio_pago', { ascending: true });
  assertOk(error, 'getMetodosPagoDescuento');
  return data ?? [];
}

export async function upsertMetodoPagoDescuento(medioPago, porcentaje) {
  const { data, error } = await supabase
    .from('metodos_pago_descuento')
    .upsert({ medio_pago: medioPago, porcentaje, updated_at: new Date().toISOString() })
    .select()
    .single();
  assertOk(error, 'upsertMetodoPagoDescuento');
  return data;
}

// --- Residuales de ortodoncia (abonos Invisalign, modulo de Comisiones) ---

export async function getResiduales() {
  const { data, error } = await supabase
    .from('residuales_ortodoncia')
    .select('*, doctores(id, titulo, nombre, apellido)')
    .order('created_at', { ascending: false });
  assertOk(error, 'getResiduales');
  return data ?? [];
}

export async function createResidual(residual) {
  const { data, error } = await supabase.from('residuales_ortodoncia').insert(residual).select('*, doctores(id, titulo, nombre, apellido)').single();
  assertOk(error, 'createResidual');
  return data;
}

export async function updateResidual(id, cambios) {
  const { data, error } = await supabase
    .from('residuales_ortodoncia')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, doctores(id, titulo, nombre, apellido)')
    .single();
  assertOk(error, 'updateResidual');
  return data;
}

export async function deleteResidual(id) {
  const { error } = await supabase.from('residuales_ortodoncia').delete().eq('id', id);
  assertOk(error, 'deleteResidual');
}

// --- Excepciones de comision: doctor + prestacion que siempre carga comision en $0 ---

export async function getExcepciones() {
  const { data, error } = await supabase
    .from('excepciones_comision')
    .select('*, doctores(id, titulo, nombre, apellido)')
    .order('created_at', { ascending: false });
  assertOk(error, 'getExcepciones');
  return data ?? [];
}

export async function createExcepcion(doctorId, patronPrestacion) {
  const { data, error } = await supabase
    .from('excepciones_comision')
    .insert({ doctor_id: doctorId, patron_prestacion: patronPrestacion })
    .select('*, doctores(id, titulo, nombre, apellido)')
    .single();
  assertOk(error, 'createExcepcion');
  return data;
}

export async function deleteExcepcion(id) {
  const { error } = await supabase.from('excepciones_comision').delete().eq('id', id);
  assertOk(error, 'deleteExcepcion');
}

// --- Descuentos por cliente de QuickBooks (ej. categoria "Jubilados") ---

export async function getDescuentos(categoria) {
  let query = supabase.from('descuentos_clientes').select('*').order('qb_display_name', { ascending: true });
  if (categoria) query = query.eq('categoria', categoria);
  const { data, error } = await query;
  assertOk(error, 'getDescuentos');
  return data ?? [];
}

export async function upsertDescuento({ categoria, qbCustomerId, qbDisplayName, porcentaje }) {
  const { data, error } = await supabase
    .from('descuentos_clientes')
    .upsert(
      { categoria, qb_customer_id: qbCustomerId, qb_display_name: qbDisplayName, porcentaje, updated_at: new Date().toISOString() },
      { onConflict: 'categoria,qb_customer_id' }
    )
    .select()
    .single();
  assertOk(error, 'upsertDescuento');
  return data;
}

export async function deleteDescuento(id) {
  const { error } = await supabase.from('descuentos_clientes').delete().eq('id', id);
  assertOk(error, 'deleteDescuento');
}

/** Usado al armar el borrador de una factura: ¿este cliente tiene un descuento configurado? */
export async function findDescuentoPorCliente(qbCustomerId) {
  const { data, error } = await supabase
    .from('descuentos_clientes')
    .select('*')
    .eq('qb_customer_id', qbCustomerId)
    .limit(1);
  assertOk(error, 'findDescuentoPorCliente');
  return data?.[0] ?? null;
}

// --- Asignaciones manuales del modulo de Comisiones (persistentes: antes se
// perdian al recargar la pagina porque solo vivian en el estado del navegador) ---

/** Trae todas las asignaciones de un tipo, como { clave: valor } (mismo formato que ya usaba el frontend). */
export async function getAsignacionesComision(tipo) {
  const { data, error } = await supabase.from('asignaciones_comision').select('clave, valor').eq('tipo', tipo);
  assertOk(error, 'getAsignacionesComision');
  return Object.fromEntries((data ?? []).map((r) => [r.clave, r.valor]));
}

/** valor null/undefined borra la asignacion (equivalente a "quitar"). */
export async function upsertAsignacionComision(tipo, clave, valor) {
  if (valor === null || valor === undefined || valor === '') {
    const { error } = await supabase.from('asignaciones_comision').delete().eq('tipo', tipo).eq('clave', clave);
    assertOk(error, 'upsertAsignacionComision:delete');
    return;
  }
  const { error } = await supabase
    .from('asignaciones_comision')
    .upsert({ tipo, clave, valor: String(valor), updated_at: new Date().toISOString() }, { onConflict: 'tipo,clave' });
  assertOk(error, 'upsertAsignacionComision');
}

// --- Clientes relacionados (facturar un paciente bajo otro Customer de QuickBooks) ---

export async function getRelaciones() {
  const { data, error } = await supabase.from('clientes_relacionados').select('*').order('nombre_paciente', { ascending: true });
  assertOk(error, 'getRelaciones');
  return data ?? [];
}

/** Usado por invoiceSync: si existe, tiene prioridad sobre el match normal por Suffix. */
export async function findRelacion(idPacienteDentalink) {
  const { data, error } = await supabase
    .from('clientes_relacionados')
    .select('*')
    .eq('id_paciente_dentalink', String(idPacienteDentalink))
    .maybeSingle();
  assertOk(error, 'findRelacion');
  return data ?? null;
}

export async function upsertRelacion({ idPacienteDentalink, nombrePaciente, qbCustomerId, qbDisplayName }) {
  const { data, error } = await supabase
    .from('clientes_relacionados')
    .upsert(
      {
        id_paciente_dentalink: String(idPacienteDentalink),
        nombre_paciente: nombrePaciente,
        qb_customer_id: qbCustomerId,
        qb_display_name: qbDisplayName,
      },
      { onConflict: 'id_paciente_dentalink' }
    )
    .select()
    .single();
  assertOk(error, 'upsertRelacion');
  return data;
}

export async function deleteRelacion(id) {
  const { error } = await supabase.from('clientes_relacionados').delete().eq('id', id);
  assertOk(error, 'deleteRelacion');
}

export default supabase;
