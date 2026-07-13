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

-- El backend usa la Service Role key (bypassa RLS), asi que RLS puede quedar
-- habilitado sin policies adicionales para bloquear acceso directo desde el
-- frontend/anon key a estas tablas.
alter table customer_index enable row level security;
alter table item_index enable row level security;
alter table synced_invoices enable row level security;
alter table review_queue enable row level security;
