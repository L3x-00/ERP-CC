# Sub-fase 9.3 — Acciones server-side, seguridad y estado de Gastos

## Server Actions

Las acciones de `src/modulos/gastos/acciones/` siguen el borde uniforme:

`'use server'` → `safeParse` Zod → sesión → `can()` → servicio/RPC
`service_role` → auditoría → respuesta genérica.

Se implementaron acciones para registrar un gasto, cambiar su estado con
compare-and-set, consultar gastos, consultar rentabilidad y procesar
comprobantes OCR. Las RPC de `20260909224643_fase_9_rpc_gastos.sql` repiten las
validaciones críticas, bloquean usuario/gasto y permiten únicamente la
transición `pendiente` → `pagado|cancelado`.

Los detalles técnicos se escriben en el registro interno; la interfaz recibe
mensajes saneados sin SQL, claves, rutas ni datos del comprobante.

## Estado y sincronización

`usarTiendaGastos` conserva únicamente gasto seleccionado, periodo (incluida
semana pasada), rango, filtros, búsqueda, estado del OCR y una revisión
efímera. Los gastos y la rentabilidad permanecen
en TanStack Query como datos de servidor.

El sincronizador escucha `gastos`, `cuentas_por_cobrar`,
`registros_consumo_material` y `sesiones_trabajo`, agrupa ráfagas y hace
`invalidateQueries` para releer por RLS. Los payloads de Realtime nunca son la
fuente de verdad ni se copian al store.

## Pruebas de seguridad

La integración verifica que operador y vendedor no puedan registrar/cambiar
gastos, mientras un contador autorizado sí puede registrar, cambiar estado y
generar auditoría. La E2E completa queda opt-in para no crear datos en remoto
sin autorización explícita.
