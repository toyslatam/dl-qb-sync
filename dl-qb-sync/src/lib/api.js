import { supabase } from './supabaseClient.js';

/** fetch() que agrega el token de sesion de Supabase como Authorization: Bearer. */
export async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers,
  };

  return fetch(path, { ...options, headers });
}
