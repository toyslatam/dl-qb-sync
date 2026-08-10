-- Corre esto una vez en Supabase: Dashboard -> SQL Editor -> New query -> pegar y ejecutar.
-- Reemplaza las tablas locales SQLite por las mismas estructuras en Postgres.

create table if not exists customer_index (
  id_dentalink text primary key,
  qb_customer_id text not null,
  qb_display_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists item_index (
  prestacion_key text primary key,
  qb_item_id text not null,
  qb_item_name text not null,
  updated_at timestamptz not null default now()
);

create table if not exists synced_invoices (
  id_pago text primary key,
  qb_invoice_id text not null,
  synced_at timestamptz not null default now()
);

-- "draft" guarda el borrador completo de la factura como JSON:
-- { idPaciente, pago: {...}, customerMatch: {qbCustomerId} | null,
--   lineas: [{ key, nombre, precio, cantidad, qbItemId, qbItemName, estado }] }
create table if not exists review_queue (
  id_pago text primary key,
  id_paciente text,
  draft jsonb not null,
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

-- Guarda el refresh_token vigente de QuickBooks (Intuit lo rota en cada uso,
-- asi que hay que persistir el mas reciente en vez de depender solo de la
-- variable de entorno, o se rompe cada vez que el servidor se reinicia).
create table if not exists oauth_tokens (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Catalogo de doctores para el modulo de Comisiones. Precargado desde la hoja
-- "Tabla%" del Excel de comisiones (sin la columna de Laboratorios, que se
-- calcula aparte desde las facturas de proveedor de la otra QuickBooks).
-- nombre/apellido = EXACTAMENTE como aparece la "Nota para cliente" de la
-- factura (sin titulo) -- es la clave para matchear la factura con el
-- doctor, nunca se le antepone el titulo para no romper el match. titulo
-- (Dr./Dra.) va aparte, solo para armar el nombre completo al mostrarlo en
-- reportes (ej. titulo + ' ' + nombre + ' ' + apellido).
create table if not exists doctores (
  id bigint generated always as identity primary key,
  titulo text not null default 'Dr.',
  nombre text not null,
  apellido text not null,
  especialidad text,
  usuario text,
  comision_pct numeric not null default 0,
  desc_tarjeta_credito numeric,
  desc_tarjeta_clave numeric,
  desc_yappy numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nombre, apellido)
);

-- Tabla "Master" del Excel de comisiones: % de descuento por medio de pago,
-- que se resta de la base antes de calcular la comision del doctor.
create table if not exists metodos_pago_descuento (
  medio_pago text primary key,
  porcentaje numeric not null default 0,
  updated_at timestamptz not null default now()
);

insert into metodos_pago_descuento (medio_pago, porcentaje) values
  ('Tarjeta de crédito (Visa o Master Card)', 0.027),
  ('Depósito bancario', 0),
  ('Efectivo', 0),
  ('Tarjeta de crédito (Visa o MasterCard) a distancia', 0.027),
  ('Tarjeta de débito (Clave)', 0.025),
  ('Transferencia electrónica (ACH)', 0),
  ('Yappy - Banco General', 0.02)
on conflict (medio_pago) do nothing;

-- Hoja "ResidualesAbonos" del Excel de comisiones: casos de residual de
-- ortodoncia (ej. abonos Invisalign). El monto residual y la lista de abonos
-- se escriben a mano (es una reconciliacion caso por caso, no una formula
-- generica); el resto (descuento tarjeta, final, comision a pagar) se
-- calcula solo en el frontend a partir de esos datos.
create table if not exists residuales_ortodoncia (
  id bigint generated always as identity primary key,
  doctor_id bigint references doctores(id) on delete set null,
  paciente text not null,
  abonos jsonb not null default '[]', -- [{ nombre, monto }]
  monto_residual numeric not null default 0,
  descuento_pct numeric not null default 0.027,
  comision_pct numeric not null default 0,
  pagado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vincula el login (Supabase Auth) de un doctor a su fila en el catalogo,
-- para que "Mi Comision" sepa filtrar los datos de ese usuario especifico.
-- "create table if not exists" no agrega columnas a una tabla que ya existe,
-- por eso va aparte como alter table.
alter table doctores add column if not exists user_email text unique;

-- Hoja "Excepciones" del Excel de comisiones: casos puntuales donde una
-- prestacion de un doctor especifico NO genera comision (ej. Dra. Ana
-- Cristina Moreno + "abono Invisalign" -> comision en 0), sin importar el
-- monto de la linea. patron_prestacion se busca como substring dentro del
-- nombre de la prestacion de la factura (sin distinguir mayusculas/tildes),
-- asi que "abono invisalign" matchea "Abono Invisalign 1-3", "2-3", etc.
create table if not exists excepciones_comision (
  id bigint generated always as identity primary key,
  doctor_id bigint not null references doctores(id) on delete cascade,
  patron_prestacion text not null,
  created_at timestamptz not null default now()
);

-- Pacientes que no se facturan a si mismos, sino bajo otro Customer de
-- QuickBooks (ej. dependientes de una cuenta familiar). Cuando existe una
-- fila aca para un paciente, tiene prioridad sobre el match normal por
-- Suffix (customer_index) al armar el borrador de la factura.
create table if not exists clientes_relacionados (
  id bigint generated always as identity primary key,
  id_paciente_dentalink text not null unique,
  nombre_paciente text not null,
  qb_customer_id text not null,
  qb_display_name text not null,
  created_at timestamptz not null default now()
);

-- El backend usa la Service Role key (bypassa RLS), asi que RLS puede quedar
-- habilitado sin policies adicionales para bloquear acceso directo desde el
-- frontend/anon key a estas tablas.
alter table customer_index enable row level security;
alter table item_index enable row level security;
alter table synced_invoices enable row level security;
alter table review_queue enable row level security;
alter table oauth_tokens enable row level security;
alter table doctores enable row level security;
alter table metodos_pago_descuento enable row level security;
alter table residuales_ortodoncia enable row level security;
alter table clientes_relacionados enable row level security;
alter table excepciones_comision enable row level security;
