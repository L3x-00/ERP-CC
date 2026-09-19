# Pendientes de negocio/decisión — resolución 2026-09-19

Vía adoptada: resolver **primero lo que cierra el criterio con la menor superficie de riesgo** y
documentar con alcance exacto lo que exige migración + revisión dedicada (catálogos editables y
edición de órdenes tocan integridad financiera/estructural: a medias sería peor que no hacerlo).

## Resuelto e implementado

### RFQ-16 · Gate de crédito en la aprobación — **implementado (app-only)**
- **Decisión:** aprobar una oportunidad exige autorización explícita de un **administrador** cuando
  la cartera del cliente (AR `pendiente`/`parcial`) más el importe neto de la cotización (descuentos
  restados, USD convertido con el TC vigente) supera `clientes.limite_credito`. `limite = 0`
  significa "sin límite" y no bloquea (consistente con la ficha del cliente).
- **Implementación:** `pipeline/servicios/evaluar-credito.ts` (puro), gate en
  `acciones/marcar-ganada.ts` (devuelve `requiereAutorizacionCredito` + `excedenteMxn`, y solo
  acepta `autorizarSobregiro` de un admin; se audita `autorizacionCredito` en el log) y
  confirmación en `selector-etapa.tsx` ("Autorizar sobrepaso y crear OP").
- **Verificación:** 4 unitarias del evaluador + 618/618 de la suite + typecheck/lint/build.
  E2E-08 queda **diseñado** (fixture de cartera al 100% pendiente de montar en el spec).
- **Por qué no se exigió un permiso nuevo:** otorgar crédito es una decisión de rol, no un permiso
  delegable; misma regla que las acciones de RBAC.

### RFQ-08 · Fechas de seguimiento y vencimiento — **esquema listo; wiring app pendiente**
- **Decisión:** `fecha_seguimiento` (+3 días hábiles desde el envío) y
  `fecha_vencimiento_cotizacion` (+10 hábiles) son fechas **editables** en calendario; la app las
  propone con una utilidad pura (`sumarDiasHabiles`, lunes–viernes) pero el vendedor puede cambiarlas.
- **Hecho:** migración `20260919000001` (columnas `date` + comentarios) verificada en PGlite (7/7).
- **Pendiente exacto:** utilidad + campos en `esquemaDatosOportunidad`/`actualizar-datos-oportunidad`
  + dos inputs con botones "＋3/＋10 hábiles" en `gestor-datos-solicitud` + tipos/mapper. Sin
  migración adicional.

### OBS-28 · Cuenta de salida en gastos — **esquema y RPC listos; wiring app pendiente**
- **Decisión:** `gastos.cuenta_bancaria_id` (FK, `ON DELETE SET NULL` para conservar histórico) y
  `registrar_gasto` con `p_cuenta_bancaria_id uuid DEFAULT NULL` (firma de 18 args; la app actual
  sigue funcionando sin cambios porque PostgREST aplica el default — verificado con la suite E2E
  contra la migración aplicada en local).
- **Hecho:** migración verificada en PGlite (cuenta persistida, sin cuenta = NULL, cuenta
  inexistente rechazada, grants) y **14/14 E2E** de regresión con la RPC nueva.
- **Pendiente exacto:** campo `cuentaBancariaId` en `esquemaRegistrarGasto`, paso del argumento en
  `registrarGastoServicio`, selector en el modal (catálogo enmascarado; opción "Sin especificar"),
  `cuentaBancariaId` en `Gasto`/mapper, y el **flujo por cuenta** (ingresos de `pagos_ar` vs
  egresos de `gastos` por cuenta) como sección de Cobranza/Dashboard.

## Diseñado con decisión, pendiente de implementar como bloque dedicado

### CFG-08/09 · Tiers y categorías editables — **decisión: configuración, no tablas nuevas**
- **Tiers:** mover Bronce/Plata/Oro/Platino (umbral + descuento) a una sección de
  `configuracion_sistema` (JSONB, como `tarifas_json.estaciones`), con los valores actuales como
  default y `calcularTier` aceptando el catálogo configurado. Requiere migración: columna
  `tiers_json` + sección nueva en `actualizar_configuracion_seccion` (CREATE OR REPLACE, firma
  idéntica) + UI en Configuración + refactor del motor de tiers.
- **Categorías:** hoy son un enum de código + CHECK en `gastos.categoria`. Decisión: catálogo
  configurable en JSONB con los 9 valores actuales como default; relajar el CHECK a formato/longitud
  y validar en app contra el catálogo (Zod). Requiere migración por el CHECK + UI de categorías.
- **Por qué no a medias:** si la UI permite borrar una categoría o tier en uso, los históricos
  deben seguir siendo legibles; el diseño conserva valores históricos y solo cambia la validación
  de capturas nuevas.

### DOC-01/03 y ORD-03 · Orden de servicio imprimible + detalle de orden — **un solo bloque app-only**
- **Decisión:** un modal/route de **Detalle de orden** que reúne datos generales (cliente, folio
  CNC, PO, fechas), partidas con horas estimadas/reales y eficiencia, totales comerciales desde la
  cotización vinculada, y un **documento imprimible de OS** (empresa desde configuración + cliente
  + partidas con precio) con el patrón de impresión ya usado por el recibo; "Reimprimir" es abrir
  el mismo documento desde la lista. Sin migración (todo sale de datos existentes).
- **Por qué bloque aparte:** es la pieza de mayor superficie UI de los pendientes; no toca datos
  y puede implementarse/verificarse sin migración, por lo que no se mezcla con los cambios SQL.

### OBS-27 · Estado de cuenta consolidado por cliente — **diseñado (app-only)**
- **Decisión:** vista por cliente con sus AR (fecha, moneda, monto, pagos, saldo, días de atraso) y
  totales, imprimible/descargable desde Cobranza; el "envío" queda fuera (no hay autorización de
  envíos y la referencia pide registrar la preparación, no el envío).
- **Prerrequisito:** permisos `ver_finanzas` (no exponerlo a `ver_clientes`); sin migración.

### ORD-05 · Edición de órdenes — **decisión: solo en borrador, con CAS, en bloque dedicado**
- **Decisión:** editar cabecera/partidas **únicamente mientras la OP está en `borrador`**, con la
  misma disciplina de las RPC existentes: función `SECURITY DEFINER` con `FOR UPDATE` y token
  `actualizado_en` (optimistic locking), auditoría y sin tocar históricos de sesiones/consumos.
  Si la orden ya arrancó, la vía es cancelar+reemplazar (D-01/D-06).
- **Requiere migración** (columnas de notas/fecha requerida si se aceptan + RPC) y pruebas de
  concurrencia; por su impacto financiero/operativo no se implementa parcialmente.

## Estado de los 7 pendientes

| Pendiente | Estado |
|---|---|
| RFQ-16 gate de crédito | ✅ implementado y probado (E2E-08 pendiente de fixture) |
| RFQ-08 fechas hábiles | 🟡 migración lista y verificada; wiring app pendiente |
| OBS-28 cuenta en gastos | 🟡 migración + RPC listos y compatibilidad verificada; wiring app y flujo pendientes |
| CFG-08/09 catálogos | 🔵 decisión tomada; migración + UI pendientes |
| DOC-01/03 + ORD-03 | 🔵 decisión tomada; bloque app-only pendiente |
| OBS-27 estado de cuenta | 🔵 decisión tomada; bloque app-only pendiente |
| ORD-05 edición de órdenes | 🔵 decisión tomada; migración + RPC + UI pendientes |
