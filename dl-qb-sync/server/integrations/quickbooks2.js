import 'dotenv/config';
import fetch from 'node-fetch';
import OAuthClient from 'intuit-oauth';
import { getSetting, setSetting } from '../db/store.js';

// Cliente de una SEGUNDA compania de QuickBooks, usado SOLO para leer costos
// de laboratorio (cuenta de gasto) y atribuirlos a la comision del doctor
// correspondiente. Este modulo NUNCA debe exponer funciones de escritura
// (crear/editar/borrar) -- es de solo lectura a proposito.

const REFRESH_TOKEN_KEY = 'qbo2_refresh_token';

const CLIENT_ID = (process.env.QBO2_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.QBO2_CLIENT_SECRET || '').trim();
const ENVIRONMENT = (process.env.QBO2_ENVIRONMENT || 'production').trim();
const REDIRECT_URI = (process.env.QBO2_REDIRECT_URI || '').trim();
const CUENTA_LABORATORIO = (process.env.QBO2_CUENTA_LABORATORIO || '').trim();

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: ENVIRONMENT,
  redirectUri: REDIRECT_URI,
});

const API_BASE = ENVIRONMENT === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';

let cachedToken = null;

export function getAuthorizeUri2() {
  return oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'dl-qb-sync-2',
  });
}

export async function handleOAuthCallback2(redirectedUrl) {
  const authResponse = await oauthClient.createToken(redirectedUrl);
  const token = authResponse.getJson();
  cachedToken = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
  await setSetting(REFRESH_TOKEN_KEY, token.refresh_token);
  return token;
}

async function refreshWithIntuit(refreshToken) {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`QBO2 refresh failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function ensureAccessToken() {
  if (cachedToken && cachedToken.expires_at > Date.now() + 30_000) {
    return cachedToken.access_token;
  }
  const rawRefreshToken = cachedToken?.refresh_token || (await getSetting(REFRESH_TOKEN_KEY)) || process.env.QBO2_REFRESH_TOKEN;
  if (!rawRefreshToken) {
    throw new Error('No hay refresh token de QuickBooks #2. Completa el login OAuth en /api/qbo2/connect primero.');
  }
  const token = await refreshWithIntuit(rawRefreshToken.trim());
  cachedToken = { ...token, expires_at: Date.now() + token.expires_in * 1000 };
  await setSetting(REFRESH_TOKEN_KEY, token.refresh_token);
  return cachedToken.access_token;
}

/** GET de solo lectura contra QuickBooks #2. A proposito no existe ninguna funcion de escritura en este archivo. */
async function qboFetch2(path) {
  const accessToken = await ensureAccessToken();
  const realmId = (process.env.QBO2_REALM_ID || '').trim();
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API_BASE}/v3/company/${realmId}${path}${separator}minorversion=65`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`QBO2 GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function qboQuery2(query) {
  return qboFetch2(`/query?query=${encodeURIComponent(query)}`);
}

/**
 * OJO: la API publica de QuickBooks NO expone custom fields en Bill/Purchase
 * (a diferencia de Invoice) -- se confirmo leyendo el JSON crudo de una
 * factura de proveedor real: el campo "DOCTOR" que se ve en la pantalla de
 * QuickBooks simplemente no viaja en la respuesta de la API. Por eso el
 * paciente se lee del campo estandar Cliente de la linea (si confirmado que
 * si viaja), y el "doctor" solo se puede ofrecer como texto libre de la
 * Descripcion de la linea (pista para que la persona lo lea a mano, no un
 * dato estructurado confiable para matchear automaticamente).
 */

/**
 * Trae los costos de laboratorio (Bills/facturas de proveedor) de un rango de
 * fechas, filtrados a la cuenta de costo de laboratorio configurada
 * (QBO2_CUENTA_LABORATORIO). Devuelve una linea por cada linea de la factura
 * de proveedor que cae en esa cuenta, con el paciente (Cliente estandar de
 * la linea) y la descripcion completa de la linea como pista de contexto.
 */
export async function getCostosLaboratorio(fechaDesde, fechaHasta) {
  if (!CUENTA_LABORATORIO) {
    throw new Error('Falta configurar QBO2_CUENTA_LABORATORIO');
  }
  const bills = [];
  let startPosition = 1;
  const pageSize = 100;
  while (true) {
    const result = await qboQuery2(
      `select * from Bill where TxnDate >= '${fechaDesde}' and TxnDate <= '${fechaHasta}' STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`
    );
    const page = result.QueryResponse?.Bill ?? [];
    bills.push(...page);
    if (page.length < pageSize) break;
    startPosition += pageSize;
  }

  const costos = [];
  for (const bill of bills) {
    for (const linea of bill.Line ?? []) {
      const detalle = linea.AccountBasedExpenseLineDetail ?? linea.ItemBasedExpenseLineDetail;
      const cuentaNombre = detalle?.AccountRef?.name ?? detalle?.ItemRef?.name ?? '';
      if (!cuentaNombre.includes(CUENTA_LABORATORIO)) continue;

      costos.push({
        idBill: bill.Id,
        numero: bill.DocNumber ?? bill.Id,
        fecha: bill.TxnDate,
        proveedor: bill.VendorRef?.name ?? '',
        paciente: detalle?.CustomerRef?.name ?? '',
        // Texto libre (no estructurado) que suele incluir el doctor -- es
        // solo una pista para revisar a mano, no un dato confiable.
        doctorTexto: linea.Description ?? '',
        monto: Number(linea.Amount ?? 0),
      });
    }
  }
  return costos;
}
