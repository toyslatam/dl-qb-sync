import 'dotenv/config';
import fetch from 'node-fetch';
import OAuthClient from 'intuit-oauth';
import { getSetting, setSetting } from '../db/store.js';

const REFRESH_TOKEN_KEY = 'qbo_refresh_token';

const oauthClient = new OAuthClient({
  clientId: process.env.QBO_CLIENT_ID,
  clientSecret: process.env.QBO_CLIENT_SECRET,
  environment: process.env.QBO_ENVIRONMENT || 'sandbox',
  redirectUri: process.env.QBO_REDIRECT_URI,
});

const API_BASE =
  (process.env.QBO_ENVIRONMENT || 'sandbox') === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';

let cachedToken = null; // { access_token, refresh_token, expires_at }

const TRANSIENT_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNRESET']);

function isTransientNetworkError(err) {
  const code = err?.code || err?.cause?.code;
  return TRANSIENT_ERROR_CODES.has(code);
}

/**
 * Reintenta operaciones de red ante cortes intermitentes (comunes con
 * firewalls/EDR corporativos que a veces bloquean la primera resolucion DNS).
 * No reintenta errores de negocio (credenciales invalidas, 4xx de QuickBooks).
 */
async function withRetry(fn, { attempts = 3, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

export function getAuthorizeUri() {
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'dl-qb-sync',
  });
}

export async function handleOAuthCallback(redirectedUrl) {
  const authResponse = await withRetry(() => oauthClient.createToken(redirectedUrl), {
    attempts: 6,
    delayMs: 1500,
  });
  const token = authResponse.getJson();
  cachedToken = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
  // Intuit rota el refresh_token en cada uso; se persiste en Supabase para
  // sobrevivir reinicios (la variable de entorno solo sirve de arranque inicial).
  await setSetting(REFRESH_TOKEN_KEY, token.refresh_token);
  return token;
}

async function ensureAccessToken() {
  if (cachedToken && cachedToken.expires_at > Date.now() + 30_000) {
    return cachedToken.access_token;
  }

  const refreshToken =
    cachedToken?.refresh_token || (await getSetting(REFRESH_TOKEN_KEY)) || process.env.QBO_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      'No hay refresh token de QuickBooks disponible. Completa el login OAuth en /api/qbo/connect primero.'
    );
  }

  oauthClient.setToken({ refresh_token: refreshToken });
  const authResponse = await withRetry(() => oauthClient.refresh());
  const token = authResponse.getJson();
  cachedToken = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
  await setSetting(REFRESH_TOKEN_KEY, token.refresh_token);
  return cachedToken.access_token;
}

async function qboFetch(path, { method = 'GET', body } = {}) {
  const accessToken = await ensureAccessToken();
  const realmId = process.env.QBO_REALM_ID;
  const res = await withRetry(() =>
    fetch(`${API_BASE}/v3/company/${realmId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  );
  if (!res.ok) {
    throw new Error(`QBO ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function qboQuery(query) {
  return qboFetch(`/query?query=${encodeURIComponent(query)}&minorversion=65`);
}

/** Trae todos los Customers activos (para construir el indice de matching). */
export async function getAllCustomers() {
  const customers = [];
  let startPosition = 1;
  const pageSize = 200;
  while (true) {
    const result = await qboQuery(
      `select * from Customer where Active = true STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    );
    const page = result.QueryResponse?.Customer ?? [];
    customers.push(...page);
    if (page.length < pageSize) break;
    startPosition += pageSize;
  }
  return customers;
}

/** Trae todos los Items (productos/servicios) activos. */
export async function getAllItems() {
  const items = [];
  let startPosition = 1;
  const pageSize = 200;
  while (true) {
    const result = await qboQuery(
      `select * from Item where Active = true STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    );
    const page = result.QueryResponse?.Item ?? [];
    items.push(...page);
    if (page.length < pageSize) break;
    startPosition += pageSize;
  }
  return items;
}

export function createCustomer(customerPayload) {
  return qboFetch('/customer', { method: 'POST', body: customerPayload });
}

export function createInvoice(invoicePayload) {
  return qboFetch('/invoice', { method: 'POST', body: invoicePayload });
}

function escapeQboLiteral(value) {
  return String(value).replace(/'/g, "\\'");
}

/** Busca Customers activos por nombre (para asignar manualmente desde la cola de revision). */
export async function searchCustomers(nameFragment) {
  const result = await qboQuery(
    `select * from Customer where Active = true and DisplayName LIKE '%${escapeQboLiteral(nameFragment)}%' MAXRESULTS 20`
  );
  return result.QueryResponse?.Customer ?? [];
}

/** Busca Items activos por nombre (para asignar manualmente desde la cola de revision). */
export async function searchItems(nameFragment) {
  const result = await qboQuery(
    `select * from Item where Active = true and Name LIKE '%${escapeQboLiteral(nameFragment)}%' MAXRESULTS 20`
  );
  return result.QueryResponse?.Item ?? [];
}
