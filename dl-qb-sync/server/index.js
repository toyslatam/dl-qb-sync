import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { ZipArchive } from 'archiver';
import { createClient } from '@supabase/supabase-js';
import {
  runSyncCycle,
  runSyncForPaciente,
  createInvoiceFromQueue,
  listarPagosDelDia,
  procesarPagoIndividual,
} from './sync/invoiceSync.js';
import {
  getPendingDrafts,
  getDraft,
  upsertDraft,
  upsertItemIndex,
  upsertCustomerIndex,
  markInvoiceSynced,
  unmarkInvoiceSynced,
  getDoctores,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getMetodosPagoDescuento,
  upsertMetodoPagoDescuento,
  getResiduales,
  createResidual,
  updateResidual,
  deleteResidual,
  getRelaciones,
  upsertRelacion,
  deleteRelacion,
  getExcepciones,
  createExcepcion,
  deleteExcepcion,
  findDoctorPorEmail,
  invitarUsuario,
} from './db/store.js';
import { normalizeKey } from './matching/itemMatch.js';
import { calcularComisiones, construirExcelComisiones, filtrarComisionesParaDoctor } from './sync/comisiones.js';
import { listarAdjuntos } from './sync/adjuntos.js';
import {
  getAuthorizeUri,
  handleOAuthCallback,
  searchCustomers,
  searchItems,
  createCustomer,
  createItem,
  getIncomeAccounts,
  getTerms,
  getPaymentMethods,
  getDepositAccounts,
  descargarAdjunto,
} from './integrations/quickbooks.js';
import { getPaciente } from './integrations/dentalink.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Rutas que no requieren login (health check y el handshake OAuth de QuickBooks,
// que es una redireccion de navegador y no puede llevar el header Authorization).
const PUBLIC_API_PATHS = ['/api/health', '/api/qbo/connect', '/api/qbo/callback'];

// Correos con acceso completo a Comisiones (todas las filas, todos los
// doctores). Debe coincidir con ADMIN_EMAILS en src/App.jsx -- ese es el
// que controla la UI, este es el que de verdad restringe los datos.
const ADMIN_EMAILS = ['contabilidad02@ctauditores.com'];

/** A que doctor (si a alguno) le corresponde ver Comisiones este usuario. */
async function resolverRolComisiones(email) {
  if (!email || ADMIN_EMAILS.includes(email)) return { rol: 'admin' };
  const doctor = await findDoctorPorEmail(email);
  if (doctor) return { rol: 'doctor', doctor };
  return { rol: 'ninguno' };
}

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

// Lista los pagos de un dia/rango tal como estan en Dentalink (sin procesarlos),
// para elegir cual traer con detalle completo.
app.get('/api/pagos', async (req, res) => {
  try {
    const { desde, hasta } = req.query ?? {};
    const pagos = await listarPagosDelDia({ fechaDesde: desde, fechaHasta: hasta });
    res.json(pagos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Trae el detalle completo de un pago puntual (match de cliente/prestaciones) y lo
// deja creado o en la cola de revision.
app.post('/api/pagos/:idPago/traer-detalle', async (req, res) => {
  try {
    const result = await procesarPagoIndividual(req.params.idPago);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// Marcar/desmarcar manualmente un pago como ya registrado en QuickBooks
// (ej. si se facturo por fuera de la app, o para corregir un estado equivocado).
app.post('/api/pagos/:idPago/marcar-registrado', async (req, res) => {
  try {
    await markInvoiceSynced(req.params.idPago, 'manual');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pagos/:idPago/marcar-pendiente', async (req, res) => {
  try {
    await unmarkInvoiceSynced(req.params.idPago);
    res.json({ ok: true });
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

// Eliminar una linea del borrador (ej. una prestacion que no corresponde a este pago).
app.delete('/api/review-queue/:idPago/lineas/:idDetalle', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    const draft = row.draft;
    draft.lineas = draft.lineas.filter((l) => String(l.idDetalle) !== req.params.idDetalle);

    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Agregar una linea manual al borrador (ej. un cargo que no vino de Dentalink).
app.post('/api/review-queue/:idPago/lineas', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { nombre, precio, cantidad } = req.body ?? {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });

    const draft = row.draft;
    const idDetalle = `manual-${Date.now()}`;
    const precioNum = precio !== undefined && precio !== '' ? Number(precio) : null;
    draft.lineas.push({
      key: normalizeKey(nombre),
      idTratamiento: null,
      idDetalle,
      nombre,
      precio: precioNum,
      cantidad: cantidad ? Number(cantidad) : 1,
      qbItemId: null,
      qbItemName: null,
      estado: precioNum === null ? 'necesita_precio' : 'necesita_item',
    });

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

// Crear un Item (producto/servicio) nuevo en QuickBooks para esta linea y asignarlo.
app.post('/api/review-queue/:idPago/lineas/:idDetalle/crear-item', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { nombre } = req.body ?? {};

    const draft = row.draft;
    const linea = draft.lineas.find((l) => String(l.idDetalle) === req.params.idDetalle);
    if (!linea) return res.status(404).json({ error: 'Linea no encontrada' });

    const cuentas = await getIncomeAccounts();
    if (cuentas.length === 0) {
      return res.status(400).json({ error: 'No hay ninguna cuenta de Ingreso activa en QuickBooks para asociar el item' });
    }

    const nombreItem = nombre || linea.nombre;
    const created = await createItem({
      Name: nombreItem,
      Type: 'Service',
      IncomeAccountRef: { value: cuentas[0].Id, name: cuentas[0].Name },
      // Todos los items que crea la app quedan exentos (0%) por defecto,
      // igual que el resto de las prestaciones dentales ya configuradas.
      Taxable: false,
      SalesTaxCodeRef: { value: process.env.QBO_TAX_CODE_ID || '7' },
    });

    linea.qbItemId = created.Item.Id;
    linea.qbItemName = created.Item.Name;
    linea.estado = linea.precio !== null ? 'matched' : 'necesita_precio';

    await upsertItemIndex(linea.key, created.Item.Id, created.Item.Name);
    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json({ draft, cuentaIngresoUsada: cuentas[0].Name });
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

// Crear un Customer nuevo en QuickBooks para este paciente (campo Suffix = id_paciente) y asignarlo.
app.post('/api/review-queue/:idPago/crear-cliente', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    const { nombre } = req.body ?? {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });

    const draft = row.draft;
    const created = await createCustomer({ DisplayName: nombre, Suffix: String(draft.idPaciente) });

    draft.customerMatch = { qbCustomerId: created.Customer.Id, qbDisplayName: nombre };
    await upsertCustomerIndex(draft.idPaciente, created.Customer.Id, nombre);
    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Editar el encabezado de la factura (N. de documento, fechas, terminos, notas, impuesto).
app.patch('/api/review-queue/:idPago/factura', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    const draft = row.draft;
    draft.factura = { ...draft.factura, ...req.body };

    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Editar los datos del deposito/pago (monto, metodo, referencia, cuenta destino).
app.patch('/api/review-queue/:idPago/deposito', async (req, res) => {
  try {
    const row = await getDraft(req.params.idPago);
    if (!row) return res.status(404).json({ error: 'No encontrado' });

    const draft = row.draft;
    draft.deposito = { ...draft.deposito, ...req.body };

    await upsertDraft(req.params.idPago, row.id_paciente, draft);
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Crear en QuickBooks la factura de un borrador ya resuelto (cliente + todas las lineas matcheadas).
// Si el body trae { registrarPago: true }, tambien crea un Payment vinculado para dejarla pagada.
app.post('/api/review-queue/:idPago/crear-factura', async (req, res) => {
  try {
    const { registrarPago } = req.body ?? {};
    const created = await createInvoiceFromQueue(req.params.idPago, { registrarPago: Boolean(registrarPago) });
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

app.get('/api/qbo/terminos', async (_req, res) => {
  try {
    res.json(await getTerms());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/qbo/metodos-pago', async (_req, res) => {
  try {
    res.json(await getPaymentMethods());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/qbo/cuentas-deposito', async (_req, res) => {
  try {
    res.json(await getDepositAccounts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Catalogo de doctores (modulo de Comisiones) ---
app.get('/api/doctores', async (_req, res) => {
  try {
    res.json(await getDoctores());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/doctores', async (req, res) => {
  try {
    const { titulo, nombre, apellido, especialidad, usuario, comisionPct, userEmail } = req.body ?? {};
    if (!nombre || !apellido) return res.status(400).json({ error: 'nombre y apellido son requeridos' });
    const doctor = await createDoctor({
      titulo: titulo || 'Dr.',
      nombre,
      apellido,
      especialidad: especialidad ?? null,
      usuario: usuario ?? null,
      comision_pct: comisionPct !== undefined ? Number(comisionPct) : 0,
      user_email: userEmail || null,
    });
    res.json(doctor);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/doctores/:id', async (req, res) => {
  try {
    const { titulo, nombre, apellido, especialidad, usuario, comisionPct, descTarjetaCredito, descTarjetaClave, descYappy } =
      req.body ?? {};
    const cambios = {};
    if (titulo !== undefined) cambios.titulo = titulo;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (apellido !== undefined) cambios.apellido = apellido;
    if (especialidad !== undefined) cambios.especialidad = especialidad;
    if (usuario !== undefined) cambios.usuario = usuario;
    if (comisionPct !== undefined) cambios.comision_pct = Number(comisionPct);
    if (descTarjetaCredito !== undefined) cambios.desc_tarjeta_credito = descTarjetaCredito === '' ? null : Number(descTarjetaCredito);
    if (descTarjetaClave !== undefined) cambios.desc_tarjeta_clave = descTarjetaClave === '' ? null : Number(descTarjetaClave);
    if (descYappy !== undefined) cambios.desc_yappy = descYappy === '' ? null : Number(descYappy);
    if (req.body?.userEmail !== undefined) cambios.user_email = req.body.userEmail || null;
    res.json(await updateDoctor(req.params.id, cambios));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/doctores/:id', async (req, res) => {
  try {
    await deleteDoctor(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Manda la invitacion de acceso (Supabase Auth) al correo ya guardado en el doctor,
// para que pueda entrar a "Mi Comision". Si ese correo ya tiene cuenta creada
// (ej. porque ya usaba la app para Facturas), solo queda vinculado -- no hace falta reinvitarlo.
app.post('/api/doctores/:id/invitar', async (req, res) => {
  try {
    const { userEmail } = req.body ?? {};
    if (!userEmail) return res.status(400).json({ error: 'userEmail es requerido' });
    await updateDoctor(req.params.id, { user_email: userEmail });
    try {
      await invitarUsuario(userEmail);
    } catch (err) {
      if (!/already registered|already exists/i.test(err.message)) throw err;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Le dice al frontend si quien inicio sesion es un doctor con acceso a "Mi Comision"
// (y a cual), para decidir que mostrar en el menu.
app.get('/api/mi-rol', async (req, res) => {
  try {
    const rolInfo = await resolverRolComisiones(req.user?.email);
    if (rolInfo.rol === 'doctor') {
      const { id, titulo, nombre, apellido } = rolInfo.doctor;
      return res.json({ rol: 'doctor', doctor: { id, titulo, nombre, apellido } });
    }
    res.json({ rol: rolInfo.rol });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Tabla Master: % descuento por medio de pago (modulo de Comisiones) ---
app.get('/api/master/metodos-pago', async (_req, res) => {
  try {
    res.json(await getMetodosPagoDescuento());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/master/metodos-pago', async (req, res) => {
  try {
    const { medioPago, porcentaje } = req.body ?? {};
    if (!medioPago) return res.status(400).json({ error: 'medioPago requerido' });
    res.json(await upsertMetodoPagoDescuento(medioPago, Number(porcentaje) || 0));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Residuales de ortodoncia (modulo de Comisiones) ---
app.get('/api/residuales', async (_req, res) => {
  try {
    res.json(await getResiduales());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/residuales', async (req, res) => {
  try {
    const { doctorId, paciente, abonos, montoResidual, descuentoPct, comisionPct } = req.body ?? {};
    if (!paciente) return res.status(400).json({ error: 'paciente requerido' });
    const creado = await createResidual({
      doctor_id: doctorId ?? null,
      paciente,
      abonos: abonos ?? [],
      monto_residual: Number(montoResidual) || 0,
      descuento_pct: descuentoPct !== undefined ? Number(descuentoPct) : 0.027,
      comision_pct: comisionPct !== undefined ? Number(comisionPct) : 0,
    });
    res.json(creado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/residuales/:id', async (req, res) => {
  try {
    const { doctorId, paciente, abonos, montoResidual, descuentoPct, comisionPct, pagado } = req.body ?? {};
    const cambios = {};
    if (doctorId !== undefined) cambios.doctor_id = doctorId;
    if (paciente !== undefined) cambios.paciente = paciente;
    if (abonos !== undefined) cambios.abonos = abonos;
    if (montoResidual !== undefined) cambios.monto_residual = Number(montoResidual);
    if (descuentoPct !== undefined) cambios.descuento_pct = Number(descuentoPct);
    if (comisionPct !== undefined) cambios.comision_pct = Number(comisionPct);
    if (pagado !== undefined) cambios.pagado = Boolean(pagado);
    res.json(await updateResidual(req.params.id, cambios));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/residuales/:id', async (req, res) => {
  try {
    await deleteResidual(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Excepciones de comision (modulo de Comisiones) ---
app.get('/api/excepciones', async (_req, res) => {
  try {
    res.json(await getExcepciones());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/excepciones', async (req, res) => {
  try {
    const { doctorId, patronPrestacion } = req.body ?? {};
    if (!doctorId || !patronPrestacion) return res.status(400).json({ error: 'doctorId y patronPrestacion son requeridos' });
    res.json(await createExcepcion(doctorId, patronPrestacion.trim()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/excepciones/:id', async (req, res) => {
  try {
    await deleteExcepcion(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Clientes relacionados (facturar un paciente bajo otro Customer de QuickBooks) ---
app.get('/api/relacionados', async (_req, res) => {
  try {
    res.json(await getRelaciones());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Trae un paciente puntual de Dentalink por id, para confirmar el nombre antes de relacionarlo.
app.get('/api/dentalink/pacientes/:id', async (req, res) => {
  try {
    const paciente = await getPaciente(req.params.id);
    if (!paciente || paciente.error || !paciente.id) {
      return res.status(404).json({ error: 'Paciente no encontrado en Dentalink' });
    }
    res.json(paciente);
  } catch (err) {
    console.error(err);
    res.status(404).json({ error: 'Paciente no encontrado en Dentalink' });
  }
});

// Relacionar un paciente con un Customer de QuickBooks ya existente.
app.post('/api/relacionados', async (req, res) => {
  try {
    const { idPacienteDentalink, nombrePaciente, qbCustomerId, qbDisplayName } = req.body ?? {};
    if (!idPacienteDentalink || !qbCustomerId) {
      return res.status(400).json({ error: 'idPacienteDentalink y qbCustomerId son requeridos' });
    }
    const relacion = await upsertRelacion({
      idPacienteDentalink,
      nombrePaciente: nombrePaciente ?? '',
      qbCustomerId,
      qbDisplayName: qbDisplayName ?? '',
    });
    res.json(relacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Crear un Customer nuevo en QuickBooks (Nombre completo, Correo, RUC en AlternatePhone) y
// relacionarlo con el paciente, en un solo paso.
app.post('/api/relacionados/crear-cliente', async (req, res) => {
  try {
    const { idPacienteDentalink, nombrePaciente, nombreCompleto, correo, ruc } = req.body ?? {};
    if (!idPacienteDentalink || !nombreCompleto) {
      return res.status(400).json({ error: 'idPacienteDentalink y nombreCompleto son requeridos' });
    }
    const payload = { DisplayName: nombreCompleto };
    if (correo) payload.PrimaryEmailAddr = { Address: correo };
    if (ruc) payload.AlternatePhone = { FreeFormNumber: ruc };

    const created = await createCustomer(payload);
    const relacion = await upsertRelacion({
      idPacienteDentalink,
      nombrePaciente: nombrePaciente ?? '',
      qbCustomerId: created.Customer.Id,
      qbDisplayName: created.Customer.DisplayName,
    });
    res.json(relacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/relacionados/:id', async (req, res) => {
  try {
    await deleteRelacion(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Reporte de Comisiones (solo lectura de QuickBooks, no escribe nada) ---
// POST (no GET) porque lleva las asignaciones manuales de laboratorio en el body.
app.post('/api/comisiones', async (req, res) => {
  try {
    const rolInfo = await resolverRolComisiones(req.user?.email);
    if (rolInfo.rol === 'ninguno') return res.status(403).json({ error: 'No tienes acceso a Comisiones' });

    const { desde, hasta, asignacionesLaboratorio, asignacionesInsumos, asignacionesDoctor } = req.body ?? {};
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    // Solo el admin puede mandar asignaciones manuales -- un doctor no debe
    // poder influir en como se reparten los costos de otras facturas.
    const esAdmin = rolInfo.rol === 'admin';
    let resultado = await calcularComisiones({
      fechaDesde: desde,
      fechaHasta: hasta,
      asignacionesLaboratorio: esAdmin ? asignacionesLaboratorio : {},
      asignacionesInsumos: esAdmin ? asignacionesInsumos : {},
      asignacionesDoctor: esAdmin ? asignacionesDoctor : {},
    });
    if (rolInfo.rol === 'doctor') resultado = filtrarComisionesParaDoctor(resultado, rolInfo.doctor);
    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comisiones/descargar', async (req, res) => {
  try {
    const rolInfo = await resolverRolComisiones(req.user?.email);
    if (rolInfo.rol === 'ninguno') return res.status(403).json({ error: 'No tienes acceso a Comisiones' });

    const { desde, hasta, asignacionesLaboratorio, asignacionesInsumos, asignacionesDoctor } = req.body ?? {};
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    const esAdmin = rolInfo.rol === 'admin';
    let resultado = await calcularComisiones({
      fechaDesde: desde,
      fechaHasta: hasta,
      asignacionesLaboratorio: esAdmin ? asignacionesLaboratorio : {},
      asignacionesInsumos: esAdmin ? asignacionesInsumos : {},
      asignacionesDoctor: esAdmin ? asignacionesDoctor : {},
    });
    if (rolInfo.rol === 'doctor') resultado = filtrarComisionesParaDoctor(resultado, rolInfo.doctor);
    const buffer = construirExcelComisiones(resultado);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="comisiones-${desde}-a-${hasta}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Adjuntos: PDFs de factura ya subidos a QuickBooks (solo lectura) ---
app.get('/api/adjuntos', async (req, res) => {
  try {
    const { desde, hasta } = req.query ?? {};
    if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });
    res.json(await listarAdjuntos({ fechaDesde: desde, fechaHasta: hasta }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/adjuntos/:attachableId/descargar', async (req, res) => {
  try {
    const nombreArchivo = req.query.nombreArchivo || `${req.params.attachableId}.pdf`;
    const buffer = await descargarAdjunto(req.params.attachableId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Descarga varios adjuntos como un solo .zip. Body: { items: [{ attachableId, nombreArchivo }] }
app.post('/api/adjuntos/descargar-zip', async (req, res) => {
  try {
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items es requerido' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="adjuntos.zip"');

    const archive = new ZipArchive();
    archive.on('error', (err) => {
      console.error(err);
      res.destroy(err);
    });
    archive.pipe(res);

    for (const item of items) {
      const buffer = await descargarAdjunto(item.attachableId);
      archive.append(buffer, { name: item.nombreArchivo || `${item.attachableId}.pdf` });
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
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
