import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { runSyncCycle, runSyncForPaciente, createInvoiceFromQueue } from './sync/invoiceSync.js';
import { getPendingDrafts, getDraft, upsertDraft, upsertItemIndex, upsertCustomerIndex } from './db/store.js';
import { buildSuffixedName } from './matching/customerMatch.js';
import {
  getAuthorizeUri,
  handleOAuthCallback,
  searchCustomers,
  searchItems,
  createCustomer,
} from './integrations/quickbooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Rutas que no requieren login (health check y el handshake OAuth de QuickBooks,
// que es una redireccion de navegador y no puede llevar el header Authorization).
const PUBLIC_API_PATHS = ['/api/health', '/api/qbo/connect', '/api/qbo/callback'];

const supabaseAuth = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

// Protege las rutas /api/* con el login de Supabase (cada usuario con su propia cuenta).
// Si no hay Supabase configurado, queda sin proteccion (solo pensado para desarrollo local).
async function requireAuth(req, res, next) {
  if (!req.path.startsWith('/api')) return next(); // el frontend estatico siempre se sirve
  if (PUBLIC_API_PATHS.includes(req.path)) return next();
  if (!supabaseAuth) return next();

  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Falta iniciar sesion' });
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }

  req.user = data.user;
  next();
}

app.use(requireAuth);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// --- QuickBooks OAuth (una sola vez para obtener el refresh token) ---
app.get('/api/qbo/connect', (_req, res) => {
  res.redirect(getAuthorizeUri());
});

app.get('/api/qbo/callback', async (req, res) => {
  try {
    const token = await handleOAuthCallback(req.url.startsWith('http') ? req.url : `http://localhost${req.originalUrl}`);
    res.send(
      `Conectado a QuickBooks.<br>` +
        `Copia estos dos valores a tu .env:<br>` +
        `QBO_REFRESH_TOKEN=<code>${token.refresh_token}</code><br>` +
        `QBO_REALM_ID=<code>${req.query.realmId}</code>`
    );
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error en OAuth callback: ${err.message}`);
  }
});

// --- Sincronizacion ---
app.post('/api/sync', async (req, res) => {
  try {
    const { desde, hasta } = req.body ?? {};
    const result = await runSyncCycle({ fechaDesde: desde, fechaHasta: hasta });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Modo de prueba: sincronizar un solo paciente (util mientras documentosTributarios no esta activo).
app.post('/api/sync/paciente/:idPaciente', async (req, res) => {
  try {
    const result = await runSyncForPaciente(req.params.idPaciente);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Cola de revision manual (borradores editables) ---
app.get('/api/review-queue', async (_req, res) => {
  try {
    res.json(await getPendingDrafts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/review-queue/:idPago', async (req, res) => {
  try {
    const draft = await getDraft(req.params.idPago);
    if (!draft) return res.status(404).json({ error: 'No encontrado' });
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Editar precio/cantidad de una linea del borrador.
app.patch('/api/review-queue/:idPago/lineas/:idDetalle', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { precio, cantidad } = req.body ?? {};

    const draft = row.draft;
    const linea = draft.lineas.find((l) => String(l.idDetalle) === req.params.idDetalle);
    if (!linea) return res.status(404).json({ error: 'Linea no encontrada' });

    if (precio !== undefined) linea.precio = Number(precio);
    if (cantidad !== undefined) linea.cantidad = Number(cantidad);
    if (linea.precio !== null && linea.qbItemId) linea.estado = 'matched';
    else if (linea.precio === null) linea.estado = 'necesita_precio';

    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Asignar un Item de QuickBooks a una linea del borrador (y recordar el mapeo para el futuro).
app.post('/api/review-queue/:idPago/lineas/:idDetalle/asignar-item', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { qbItemId, qbItemName } = req.body ?? {};
    if (!qbItemId) return res.status(400).json({ error: 'qbItemId requerido' });

    const draft = row.draft;
    const linea = draft.lineas.find((l) => String(l.idDetalle) === req.params.idDetalle);
    if (!linea) return res.status(404).json({ error: 'Linea no encontrada' });

    linea.qbItemId = qbItemId;
    linea.qbItemName = qbItemName ?? null;
    linea.estado = linea.precio !== null ? 'matched' : 'necesita_precio';

    await upsertItemIndex(linea.key, qbItemId, qbItemName ?? linea.nombre);
    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Asignar un Customer ya existente en QuickBooks al borrador (y recordar el mapeo).
app.post('/api/review-queue/:idPago/asignar-cliente', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { qbCustomerId, qbDisplayName } = req.body ?? {};
    if (!qbCustomerId) return res.status(400).json({ error: 'qbCustomerId requerido' });

    const draft = row.draft;
    draft.customerMatch = { qbCustomerId, qbDisplayName: qbDisplayName ?? null };
    await upsertCustomerIndex(draft.idPaciente, qbCustomerId, qbDisplayName ?? '');
    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Crear un Customer nuevo en QuickBooks para este paciente (sufijo DL{id} incluido) y asignarlo.
app.post('/api/review-queue/:idPago/crear-cliente', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { nombre } = req.body ?? {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });

    const draft = row.draft;
    const displayName = buildSuffixedName(nombre, draft.idPaciente);
    const created = await createCustomer({ DisplayName: displayName });

    draft.customerMatch = { qbCustomerId: created.Customer.Id, qbDisplayName: displayName };
    await upsertCustomerIndex(draft.idPaciente, created.Customer.Id, displayName);
    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Crear en QuickBooks la factura de un borrador ya resuelto (cliente + todas las lineas matcheadas).
app.post('/api/review-queue/:idPago/crear-factura', async (req, res) => {
  try {
    const created = await createInvoiceFromQueue(req.params.idPago);
    res.json(created);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// --- Busqueda en QuickBooks (para los selectores de la cola de revision) ---
app.get('/api/qbo/items/buscar', async (req, res) => {
  try {
    res.json(await searchItems(req.query.q ?? ''));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/qbo/customers/buscar', async (req, res) => {
  try {
    res.json(await searchCustomers(req.query.q ?? ''));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// En produccion, un solo servicio sirve la API y el frontend ya compilado (npm run build -> dist/).
const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) next();
  });
});

const port = process.env.PORT || 8765;
app.listen(port, () => {
  console.log(`dl-qb-sync API escuchando en http://127.0.0.1:${port}`);
});
