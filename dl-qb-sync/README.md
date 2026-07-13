# dl-qb-sync

Sincroniza facturas de venta desde Dentalink hacia QuickBooks Online, matcheando
clientes (por sufijo `- DL{id}` en el nombre) y prestaciones (por código o nombre)
ya existentes, y dejando en una cola de revisión manual todo lo que no matchee limpio.

## 1. Instalar dependencias

```powershell
npm install
```

## 2. Configurar credenciales

```powershell
Copy-Item .env.example .env
```

Completa `DENTALINK_TOKEN`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET` y `QBO_REALM_ID`.

## 3. Conectar QuickBooks (una sola vez)

Con el servidor corriendo (`npm run dev:api`), visita:

```
http://127.0.0.1:8765/api/qbo/connect
```

Autoriza el acceso en QuickBooks; el callback te mostrará un `refresh_token`.
Cópialo a `.env` como `QBO_REFRESH_TOKEN`.

## 4. Levantar web + API

```powershell
npm run dev:full
```

- Web: http://localhost:8080
- API: http://127.0.0.1:8765/api/health

Desde la web puedes lanzar la sincronización por rango de fechas y revisar la
cola de pendientes (clientes o prestaciones sin match, o con datos incompletos).

## 5. Sincronización por línea de comandos

```powershell
npm run sync -- --desde=2026-07-01 --hasta=2026-07-13
# o para un solo paciente (modo de prueba):
npm run sync -- --paciente=12345
```

## 6. Inspeccionar datos reales de un paciente

`documentosTributarios` no está activo en todas las cuentas de Dentalink. Antes
de confiar en los nombres de campo asumidos en `invoiceSync.js`, corre esto
contra un paciente real y revisa el JSON crudo:

```powershell
npm run inspect -- --paciente=12345
```

## Notas de diseño

- La fuente de cada factura es `/pagos` (o `/pacientes/{id}/pagos` en modo de
  prueba); las líneas (prestaciones) se arman juntando los detalles de todos
  los tratamientos del paciente vía `/pacientes/{id}/tratamientos` y
  `/tratamientos/{id}/detalles`. No hay un vínculo documentado pago→detalle,
  así que el borrador junta todas las prestaciones del paciente y el humano
  confirma/edita cuáles corresponden antes de crear la factura.
- Todas las operaciones contra QuickBooks son aditivas: nunca se actualiza ni
  borra un Customer/Item existente. Si el cliente o alguna línea no matchea,
  el pago completo queda como **borrador editable** en la cola de revisión
  (`server/db/store.js`, tabla `review_queue`) en vez de crearse a medias.
- Desde la web (`ReviewQueue` + `DraftRow`) se puede: buscar y asignar un Item
  de QuickBooks a una línea, **crear un Item nuevo** si no existe (usa la
  primera cuenta de Ingreso activa), editar precio/cantidad a mano, **eliminar
  líneas** que no correspondan, **agregar líneas manuales**, buscar y asignar
  un Customer existente, o crear uno nuevo (con el sufijo `- DL{id}` para que
  matchee automáticamente la próxima vez). Hay una vista previa de cómo
  quedará la factura antes de crearla. Recién cuando cliente + todas las
  líneas están resueltas se habilita "Crear factura en QuickBooks", con la
  opción de además **registrar el pago/depósito** para dejarla cerrada (el
  pago ya ocurrió en Dentalink, esto solo lo refleja en QuickBooks).
- El índice de matching (`customer_index` / `item_index`) se reconstruye en
  cada corrida leyendo QuickBooks, así que siempre refleja el estado actual.
  Cada asignación manual también actualiza este índice para que la próxima
  vez esa misma prestación/cliente matchee solo.
- Los pagos ya sincronizados quedan registrados en `synced_invoices` para que
  reintentos no dupliquen facturas.
