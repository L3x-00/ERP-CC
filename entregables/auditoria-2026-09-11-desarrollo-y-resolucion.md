# Auditoría técnica ORCA MFG ERP v2 — Desarrollo y resolución

> **Fecha:** 2026-09-11
> **Alcance:** revisión integral contra las 14 reglas de negocio irrompibles y
> las 10 prioridades del encargo; corrección de hallazgos reproducibles dentro
> del stack vigente (Next.js 16, React 19, TypeScript strict, Supabase,
> TanStack Query v5, Zustand v5, Tailwind v4, Zod v4).
> **Estado remoto:** Fases 0–8 aplicadas en Supabase; Fases 9–12 implementadas
> localmente y aún no aplicadas al remoto (bloqueo 403 de CLI).
> **Naturaleza de esta entrega:** auditoría + parches de código + migraciones
> SQL correctivas listas para aplicación manual. **No se aplicó ninguna
> migración ni se tocó el remoto.**

---

## 1. Resumen ejecutivo

Se auditaron los 15 módulos de `src/modulos/`, el núcleo (`src/nucleo/`), los
stores de `src/estado/`, las 43 migraciones SQL y las Server Actions. Se
detectaron y corrigieron **3 hallazgos críticos, 16 advertencias y 10 mejoras**
en código TypeScript, componentes y SQL. Se generaron **5 migraciones
correctivas idempotentes** y se corrigió una migración de Fase 9 que abortaba en
instalación limpia.

Gates locales ejecutados después de los cambios:

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 errores / 0 warnings |
| `pnpm test` (unitarias) | ✅ 47 archivos / 382 pruebas |
| `pnpm test:integracion` | ✅ 11 archivos / 47 pruebas |
| `pnpm build` | ✅ 16 rutas compiladas |

Hallazgo adicional no reportado por los auditores automáticos: **secuencias de
escape Unicode literales (`\u00f3`) renderizadas como texto crudo** en cuatro
archivos de Planeación. Corregido.

---

## 2. 🔴 CRÍTICO — 3 hallazgos (todos resueltos)

### CRÍTICO-1 — `registrar_gasto` con grants sobre una firma inexistente

- **Archivo:** `supabase/migrations/20260909224643_fase_9_rpc_gastos.sql:121-128`
- **Problema:** la función se declara con `p_fecha_gasto timestamptz` y
  `p_fecha_vencimiento timestamptz`, pero el `REVOKE`/`GRANT` usaba `date`.
  PostgreSQL resuelve funciones por coincidencia exacta de tipos: la migración
  aborta con `42883` en instalación limpia. Si el archivo se aplicó sentencia
  por sentencia, `registrar_gasto` conserva el `EXECUTE` por defecto de
  `PUBLIC/anon/authenticated`.
- **Impacto en negocio:** un cliente autenticado podía invocar la RPC por
  PostgREST saltándose la Server Action y la auditoría, suplantando
  `p_creado_por` (falsificar gastos a nombre de un contador/admin).
- **Regla violada:** ciclo de vida de RPC financieras; Regla 8 (frontera de
  autorización); ADR-0009.4.
- **Corrección aplicada:**
  1. Firma corregida en la migración original (`timestamptz, timestamptz`).
  2. Migración correctiva idempotente `20260911000001_auditoria_corregir_grants_fase_9.sql`
     que re-aplica `REVOKE`/`GRANT` con `to_regprocedure` (cubre instalaciones
     parcialmente aplicadas).

### CRÍTICO-2 — IDOR horizontal en vinculación Pipeline → Clientes

- **Archivo:** `src/modulos/clientes/acciones/vincular-desde-pipeline.ts:37-47`
- **Problema:** la acción exigía solo `can('ver_clientes')` y cargaba la
  oportunidad con el **cliente admin (service_role, sin RLS)**. Cualquier
  vendedor podía promover/ligar oportunidades de otros vendedores con un UUID
  arbitrario, creando clientes a partir de datos ajenos y alterando
  `pipeline.cliente_id`.
- **Impacto en negocio:** fuga/cruce de cartera comercial entre vendedores;
  cliente duplicado con datos de otra oportunidad.
- **Regla violada:** mínimo privilegio; aislamiento por vendedor/RLS.
- **Corrección aplicada:** la carga ahora usa `crearClienteSupabaseServidor()`
  (RLS) y se exige `op.vendedorId === usuario.id` o `ver_pipeline_equipo`; si no,
  responde "Oportunidad no encontrada" (sin filtrar existencia). El cliente
  admin se conserva únicamente para la escritura de `cliente_id`.

### CRÍTICO-3 — Rate limiting de PIN/password evadible con `X-Forwarded-For`

- **Archivo:** `src/nucleo/autenticacion/limitar-intentos.ts:13-20`
- **Problema:** el identificador del rate limit tomaba el **primer** valor de
  `x-forwarded-for`, que es controlable por el cliente en proxies aditivos.
  Rotando esa cabecera se evadía el bloqueo de 5 intentos.
- **Impacto en negocio:** fuerza bruta contra PIN de 4–6 dígitos y, por el
  diseño de `buscarOperadorPorPin` (bcrypt contra todos los operadores), un
  vector de agotamiento de CPU; además bloqueos dirigidos por IP falsa.
- **Regla violada:** Prioridad 5 (rate limiting antes de bcrypt, fallo cerrado).
- **Corrección aplicada:** prioridad a cabeceras fijadas por la plataforma
  (`x-vercel-forwarded-for`, `x-real-ip`); en su ausencia se toma el **último**
  salto de `x-forwarded-for` (el más cercano al servidor) y nunca el primero.
  Se mantiene `'desconocido'` como último recurso.

### CRÍTICO-4 (no reportado por los agentes) — Escape Unicode literal en UI

- **Archivos:** `src/modulos/planeacion/componentes/calendario-planeacion.tsx`,
  `operacion-planeacion.tsx`, `panel-asignacion-planeacion.tsx`,
  `src/modulos/planeacion/servicios/planeacion-servicio.ts`
- **Problema:** cadenas y comentarios contenían secuencias literales `\u00e1`,
  `\u00f3`, `\u00ed`, `\u00c1`. En comentarios es inocuo; en JSX y strings de UI
  se renderiza el texto `preparaci\u00f3n` en pantalla.
- **Impacto en negocio:** textos de Planeación ilegibles para el operador
  (preparación, área, acción, mensajes de error del formulario).
- **Regla violada:** calidad de interfaz / encoding (lección de CLAUDE.md #2).
- **Corrección aplicada:** reemplazo de secuencias por caracteres UTF-8 reales
  en los 4 archivos (26 ocurrencias), escritos como UTF-8 sin BOM.

---

## 3. 🟡 ADVERTENCIA — 16 hallazgos (14 resueltos, 2 pendientes)

### ADVERTENCIA-1 — Completar OP con partidas pendientes

- **Archivo:** `supabase/migrations/20260812010000_fase_5_operacion_ordenes.sql:288-295`
- **Problema:** `cambiar_estado_orden` permitía `en_proceso → completada` sin
  validar partidas; la UI exponía "Completar" siempre.
- **Impacto:** órdenes "completadas" con piezas pendientes; Kanban y dashboard
  las contaban como terminadas. Cobranza las rechazaba después (compensación).
- **Regla violada:** 2 (la OP completada debe implicar 100 % producido).
- **Corrección:** en la migración `20260911000002` se agregó la validación
  `orden_con_partidas_pendientes`; en `tabla-ordenes.tsx` el botón "Completar"
  se deshabilita hasta que todas las partidas alcancen lo solicitado.

### ADVERTENCIA-2 — Avance de piso no auto-completaba la OP

- **Archivo:** `supabase/migrations/20260812052820_...:550-561`
- **Problema:** `registrar_avance_partida_op` actualizaba la partida pero nunca
  marcaba la OP completada (solo el cierre de sesión de Fase 7 lo hacía).
- **Impacto:** con todo producido vía piso, la OP quedaba `en_proceso` y
  `abrir_cuenta_por_cobrar` la rechazaba (`orden_no_lista_para_cobranza`).
- **Regla violada:** 2/3 (sincronización de estado al registrar avances).
- **Corrección:** `20260911000002` agrega el auto-completado con
  `NOT EXISTS (cantidad_producida < cantidad_solicitada)`, en la misma
  transacción y condicionado a `estado='en_proceso'`.

### ADVERTENCIA-3 — Orden de locks ABBA entre Planeación y Producción

- **Archivos:** `20260813205005_...:231-248` (recurso→partida) vs
  `20260814044733_...:184-196` (partida→…→recurso).
- **Problema:** `programar_partida_recurso` tomaba primero el recurso; el motor
  de sesiones toma primero la partida. Deadlock `40P01` posible al programar y
  operar la misma partida/recurso en paralelo.
- **Impacto:** transacción abortada con error genérico al usuario (reintento).
- **Regla violada:** contrato de locks / estabilidad bajo concurrencia.
- **Corrección:** `programar_partida_recurso` reordenada a
  **partida → orden → recurso** en `20260911000002`. Contrato documentado en el
  encabezado de la migración.

### ADVERTENCIA-4 — `cerrar_sesion` bloqueaba sesión→partida (inverso al resto)

- **Archivo:** `20260814044733_...:184-196`
- **Problema:** el cierre bloqueaba `sesiones_trabajo` antes que
  `partidas_orden_produccion`; el inicio bloquea partida primero. Deadlock con
  inicio/cierre simultáneo del mismo operador.
- **Corrección:** `20260911000002` lee la sesión sin lock para descubrir la
  partida, bloquea partida → orden → programación → recurso y **después** la
  sesión, revalidando identidad/estado (`sesion_no_activa` si cambió).

### ADVERTENCIA-5 — Programar partidas de órdenes terminales

- **Archivo:** `20260813205005_...:244-255`
- **Problema:** no se validaba el estado de la OP al programar; una pestaña
  obsoleta o llamada directa podía programar partidas de órdenes
  `completada/cancelada`, ocupando el candado del recurso y falseando capacidad.
- **Corrección:** `20260911000002` valida `orden.estado NOT IN
  ('completada','cancelada')` → `orden_no_programable`.

### ADVERTENCIA-6 — Reprogramar programación `en_proceso`

- **Archivo:** `20260813211519_...:49-54`
- **Problema:** solo se excluían `cancelada/completada`; se podía mover una
  programación con sesión activa a otro recurso/fecha.
- **Impacto:** el cierre liberaba el recurso nuevo y el histórico de capacidad
  del recurso original quedaba inconsistente.
- **Corrección:** `20260911000002` restringe a `programada|bloqueada` →
  `programacion_no_reprogramable`.

### ADVERTENCIA-7 — Reasignar partida con sesión activa (bloqueo mutuo)

- **Archivo:** `20260812052820_...:284-319`
- **Problema:** `asignar_operador_a_partida_op` permitía cambiar el operador
  con una sesión `activa`; el cierre exige que el operador asignado siga siendo
  el de la sesión → nadie puede cerrar.
- **Corrección:** `20260911000002` rechaza con `partida_con_sesion_activa`.

### ADVERTENCIA-8 — Permisos financieros solo en la Server Action

- **Archivo:** `20260814143341_fase_8_motor_pagos.sql:94-102, 283-291`
- **Problema:** `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` solo
  validaban usuario activo, no `registrar_pagos`/`aplicar_saldos`.
- **Corrección:** `20260911000003` valida el permiso contra `permisos_rol` antes
  de cualquier efecto (sin lock, para no alterar el orden AR→usuario→cliente).

### ADVERTENCIA-9 — Reintento idempotente de saldo con cliente incorrecto

- **Archivo:** `20260814143341_...:256-261`
- **Problema:** si el reintento traía un `p_cliente_id` que no correspondía, el
  `SELECT` no encontraba fila y se devolvía `idempotente=true` con saldos NULL.
- **Corrección:** `20260911000003` añade `IF NOT FOUND THEN RAISE
  solicitud_aplicacion_no_corresponde` en el camino idempotente.

### ADVERTENCIA-10 — MXN sin exigir tipo de cambio 1

- **Archivos:** `20260814143339_...:43-47`, `20260814143341_...:46-54`
- **Problema:** un pago MXN con TC ≠ 1 inflaba el equivalente acreditado; una AR
  MXN con TC ≠ 1 distorsionaba aging/crédito/rentabilidad.
- **Corrección:** validación en ambas RPC (`tipo_cambio_mxn_invalido`,
  `cuenta_mxn_tipo_cambio_invalido`) + constraints `NOT VALID`
  `cuentas_por_cobrar_mxn_tc_uno` y `pagos_ar_mxn_tc_uno`.

### ADVERTENCIA-11 — Pipeline: INSERT directo fabricaba `folio_op`

- **Archivos:** `20260706000006_...:52-62`, `20260812052820_...:610-618`
- **Problema:** la política `pipeline_insertar` permitía a `authenticated`
  insertar con `folio_op` arbitrario (el trigger protector solo cubría UPDATE),
  fuera de la SEQUENCE.
- **Corrección:** `20260911000003` elimina la política. La creación sigue
  pasando por la Server Action con `service_role` (que no usa RLS).

### ADVERTENCIA-12 — `aprobar_oportunidad_y_crear_orden` no reconciliaba el reintento

- **Archivo:** `20260812010000_...:197-205`
- **Problema:** si la OP ya existía, salía con `ya_existia=true` sin re-marcar
  `ganada` ni validar cliente. Tras una reversión admin, "Ganar" reportaba
  éxito con la oportunidad en `negociacion` (o ligada a otro cliente).
- **Corrección:** `20260911000003` valida `orden.cliente_id = p_cliente_id`
  (`cliente_no_corresponde_orden`) y reconcilia `etapa='ganada'` y
  `cliente_id` antes del early return.

### ADVERTENCIA-13 — Datos de servidor duplicados en Zustand

- **Archivos:** `src/estado/uso-tienda-notificaciones.ts`,
  `uso-tienda-configuracion.ts`, `tienda-usuario.ts`, `uso-tienda-dashboard.ts`,
  `centro-notificaciones-header.tsx`, `operacion-configuracion.tsx`,
  `operacion-dashboard.tsx`.
- **Problema:** notificaciones, configuración y snapshot del dashboard se
  copiaban a Zustand y la UI podía servirse del store en vez de TanStack Query
  (regla 10); `tienda-usuario` era estado muerto con usuario/permisos.
- **Corrección:**
  - Eliminados los stores `uso-tienda-notificaciones`, `uso-tienda-configuracion`
    y `tienda-usuario` (sin consumidores tras el refactor).
  - El centro de notificaciones renderiza `consulta.data`; el badge se deriva de
    la misma fuente.
  - Configuración usa exclusivamente la caché de TanStack Query; tras guardar
    actualiza esa caché (dato confirmado por el servidor), sin copia en Zustand
    ni `useState` espejo.
  - Dashboard eliminó `datosConsolidados`; solo conserva filtro/errores/revisión.
  - Se eliminaron los tests de stores retirados
    (`comentarios-tienda.test.ts`, `configuracion-tienda.test.ts`).

### ADVERTENCIA-14 — Cliente: consumo/tier y crédito usado fijos en 0

- **Archivos:** `src/modulos/clientes/servicios/calcular-consumo.ts`,
  `credito-usado.ts`, `obtener-cliente-por-id.ts`, `badge-tier.tsx`,
  `alerta-credito.tsx`, `ficha-cliente.tsx`.
- **Problema:** el hook de Fase 8 nunca se implementó (devolvía 0) y la UI
  pasaba 0 a `calcularTier`/`verificarCredito`: tiers automáticos siempre
  Bronce y la alerta de crédito excedido nunca se disparaba. `obtenerCreditoUsado`
  era código muerto.
- **Corrección:** `calcularConsumoUltimos3Meses` suma AR no cancelada de los
  últimos 3 meses convertida a MXN (RLS); `obtenerCreditoUsado` se invoca desde
  `obtenerClientePorId`; la ficha pasa los valores reales a badge y alerta. Un
  usuario sin `ver_finanzas` ve 0 porque RLS oculta las AR (comportamiento
  documentado en el código).

### ADVERTENCIA-15 — Permisos de crédito en Clientes

- **Archivos:** `src/modulos/clientes/acciones/actualizar-cliente.ts:34-49`,
  `crear-cliente.ts:33-40`.
- **Problema:** `limite_credito` y `estado` se escribían con `ver_clientes`
  (vendedor). Un vendedor podía elevar su propio límite o reactivar clientes.
- **Corrección:** ambos campos exigen `ver_finanzas` en actualización; el alta
  exige `ver_finanzas` si `limiteCredito > 0`. El estado inicial `activo` del
  alta se conserva como diseño de Fase 3.

### ADVERTENCIA-16 — Realtime incompleto y refresco duplicado

- **Archivos:** `sincronizador-produccion-realtime.tsx`,
  `panel-inventario.tsx` (nuevo `sincronizador-inventario-realtime.tsx`),
  `operacion-gastos.tsx`, `operacion-cobranza.tsx`.
- **Problema:** Producción no escuchaba `recursos_planeacion`; Inventario no
  tenía sincronizador (el stock de otros usuarios no refrescaba); Gastos y
  Cobranza disparaban doble fetch (bump de revisión + invalidación por prefijo).
- **Corrección:** `recursos_planeacion` agregada al listener; se creó
  `SincronizadorInventarioRealtime` (materiales + movimientos, agrupación 350 ms,
  invalidación `['inventario']`) montado en el panel; en Gastos/Cobranza se dejó
  una sola revalidación (`invalidateQueries`).

### ADVERTENCIA-P1 (pendiente) — Atomicidad de guardado de cotización

- **Archivo:** `src/modulos/pipeline/acciones/crear-cotizacion.ts:37-60` (y
  `actualizar-cotizacion.ts`).
- **Problema:** `delete` + `insert` de líneas son dos statements HTTP
  separados; si el insert falla, la cotización queda vacía.
- **Sugerencia:** RPC `guardar_cotizacion(p_pipeline_id uuid, p_lineas jsonb)`
  con lock de la oportunidad y reemplazo transaccional. **No implementado** por
  implicar un contrato de RPC nuevo (fuera del alcance de corrección directa);
  queda documentado para la siguiente iteración.

### ADVERTENCIA-P2 (pendiente, aceptada por diseño) — Máquina de estados de Gastos

- **Archivos:** `20260909224637_...`, `20260909224643_...`,
  `docs/fase-9/sub-fase-3-acciones-seguridad-y-estado.md:14`.
- **Situación:** el encargo describía `borrador → aprobado → pagado/cancelado`,
  pero la Fase 9 cerrada y sus docs declaran `pendiente → pagado|cancelado`.
  No hay contradicción docs↔código; cambiarla sería un cambio funcional
  (aprobación four-eyes) fuera del alcance de esta corrección. Se deja
  registrado como decisión de producto pendiente.

---

## 4. 🔵 MEJORA — 10 hallazgos (8 resueltos, 2 pendientes)

| # | Hallazgo | Archivo | Estado / corrección |
|---|---|---|---|
| M1 | Mensajes con detalle interno (`'El OCR no está configurado'`, duplicados RFC) | `gastos/acciones/procesar-comprobante-ocr.ts:54`, `clientes/acciones/*.ts` | ✅ Mensajes genéricos; detalle a `console.error` (regla 8) |
| M2 | Mappers numéricos aceptaban `''` como 0 (`Number('') === 0`) | `configuracion/tipos/configuracion.ts:147`, `dashboard/tipos/dashboard.ts:200` | ✅ Cadena vacía/solo espacios tratada como inválida |
| M3 | Enums de Pipeline convertidos con `as` | `pipeline/tipos/indice.ts:97-107` | ✅ `validarEnumerado` lanza ante drift de BD |
| M4 | Log con mensaje crudo del error | `comentarios/acciones/agregar-comentario.ts:70`, `eliminar-comentario.ts:54`, `configuracion/acciones/utilidades-acciones.ts:20` | ✅ Código estable (`error_servicio_comentarios`, `error_servicio_configuracion`) |
| M5 | `admin.ts` sin guard de servidor | `nucleo/supabase/admin.ts:1` | ✅ `import 'server-only'` + alias de stub en Vitest |
| M6 | Sin auditoría de PIN duplicado/inválido | `nucleo/autenticacion/pin-operador.ts`, `autenticacion/acciones/validar-pin.ts` | ✅ `buscarOperadorPorPin` devuelve `unico|duplicado|sin_coincidencia`; se registra `acceso_pin_duplicado`/`acceso_pin_invalido` en `logs` (nuevo `registrarAccesoNoValido`) |
| M7 | Sesión PIN renovable sin tope absoluto | `nucleo/autenticacion/sesion.ts`, `acciones/renovar-sesion.ts` | ✅ `MAXIMO_SESION_OPERADOR_MINUTOS = 8 h`: la cookie no vive más allá de `iniciadaEn + máximo` |
| M8 | Secreto HMAC sin entropía mínima | `nucleo/autenticacion/sesion.ts:8-14` | ✅ Exige ≥ 32 caracteres y falla cerrado |
| M9 | Códigos de error de entrega colapsados a `desconocido` | `produccion/servicios/entrega-servicio.ts` | ✅ Códigos tipados y mensajes por `error.codigo` |
| M10 | `materialSeleccionado` (fila de servidor) en Zustand | `estado/inventario-tienda.ts:32` | ⏳ Pendiente: guardar `materialSeleccionadoId` y derivar el material de la caché; documentado como deuda controlada |

### Refuerzos SQL adicionales (MEJORA, aplicados)

| Refuerzo | Migración | Detalle |
|---|---|---|
| PIN hash no legible | `20260911000004` | `REVOKE SELECT ON usuarios` + `GRANT SELECT (columnas seguras)`; `pin_operador` fuera del alcance de `authenticated` |
| CPP histórico protegido | `20260911000004` | `movimientos_inventario` ahora exige admin o `gestionar_inventario` |
| Admin explícito en Gastos | `20260911000004` | Política de lectura con `es_admin() OR ver_finanzas` |
| FKs faltantes | `20260911000004` | `movimientos_inventario.orden_id`, `reservas_material.orden_id`, `pagos_ar.cuenta_bancaria_id` (condicional a Fase 11), `NOT VALID` |
| Stock no negativo declarativo | `20260911000004` | `CHECK (stock_actual_control >= 0) NOT VALID` |
| Firma de entrega segura | `20260911000004` | `CHECK` de URL `http(s)` en `notas_entrega.firma_cliente_url` |
| Ajuste de inventario negativo | `20260911000004` | `registrar_movimiento_inventario` permite delta con signo solo en `ajuste_inventario`; `search_path = ''` |
| Menciones solo UUID | `20260911000004` | Trigger `procesar_menciones_comentario` valida UUID v4/v5; `search_path = ''` |
| Secuencia legada revocada | `20260911000004` | `REVOKE ALL ON SEQUENCE seq_folio_op` |
| Aging del periodo anterior | `20260911000005` | `obtener_metricas_contador` replica buckets por `fecha_vencimiento` contra `v_anterior_fin` y CxP por vencer/vencido real |
| Realtime de kardex | `20260911000004` | `movimientos_inventario` agregada a `supabase_realtime` |

---

## 5. ✅ VERIFICADO (sin hallazgos)

- **Folios OP/NE/REC/GTO:** generados en PostgreSQL por SEQUENCE (`generar_folio_orden`,
  `generar_folio_nota_entrega`, `generar_folio_recibo`, `generar_folio_gasto`),
  `EXECUTE` solo `service_role`; RPCs de RLS de mínimo privilegio.
- **Cobranza:** `abrir_cuenta_por_cobrar` exige OP `completada` y todas las
  partidas 100 % producidas; importe explícito; idempotencia `solicitud_id`
  (`UNIQUE` + `ON CONFLICT DO NOTHING` + relectura); monedero MXN `numeric(14,4)`
  con redondeo a 4 decimales.
- **Inventario:** `registrar_consumo_material_op` toma partida→orden→material
  con `FOR UPDATE`; CPP congelado en `costo_unitario_momento`; merma costeada
  con `cantidad_usada + cantidad_scrap`; stock negativo rechazado.
- **Sesiones:** índices únicos parciales por operador y por programación;
  cierre libera programación/recurso en la misma transacción y auto-completa la
  OP con `bool_and`.
- **PIN:** bcrypt (`RONDAS_SAL_BCRYPT`), cookie HMAC-SHA256 verificada con
  WebCrypto, `httpOnly`, `SameSite=Lax`, `Secure` en producción; revalidación
  contra BD en cada operación de piso; reconfirmación en cierre de sesión.
- **SSE de taller:** eventos sin payload (`{}`), canal Realtime server-side con
  `service_role`, revalidación de operador activo cada 30 s, sin costos ni
  credenciales.
- **Dashboard:** RPCs `SECURITY DEFINER` con rangos semiabiertos y máximo 366
  días; `ver_finanzas` controla CxC/CxP/utilidad/margen; sin vistas
  materializadas; mappers rechazan `NaN`/`Infinity` y campos extra.
- **Rentabilidad:** ingreso solo de CxC no cancelada vinculada a la OP; gastos
  cancelados excluidos; materiales a CPP histórico; mano de obra con tarifa
  congelada por sesión.
- **Realtime:** todos los listeners invalidan TanStack Query sin usar payloads;
  cleanup en el `return` del `useEffect`; sin `setQueryData` con payloads.
- **Server Actions:** 63 acciones auditadas con sesión → Zod → `can()` →
  servicio → `registrarLog` (que nunca lanza); RBAC de permisos exige admin
  explícito en `asignar-permiso`/`revocar-permiso`.
- **Configuración:** singleton `main` por CHECK; RPC con `FOR UPDATE` y
  validación de actor admin antes de combinar JSONB.
- **Comentarios:** texto plano escapado, CHECK sin `<>`, menciones solo a
  usuarios activos, enlaces internos validados, trigger `SECURITY DEFINER` en
  la transacción del comentario.
- **Documentos de entrega:** `notas_entrega`/`partidas_nota_entrega` sin
  columnas de precio.
- **TypeScript:** 0 `any` explícito/implícito, `as unknown as` solo tras
  `safeParse` Zod, tipos Supabase usados desde el archivo generado.

---

## 6. Archivos tocados

### Código (51 archivos modificados/creados/eliminados)

- **Auth/PIN:** `nucleo/autenticacion/{constantes,sesion,limitar-intentos,pin-operador}.ts`,
  `nucleo/auditoria/registrar-log.ts`, `nucleo/supabase/admin.ts`,
  `autenticacion/acciones/{validar-pin,renovar-sesion}.ts`.
- **Órdenes/Producción:** `ordenes/componentes/tabla-ordenes.tsx`,
  `produccion/componentes/sincronizador-produccion-realtime.tsx`,
  `produccion/servicios/{entrega-servicio,sesiones-servicio}.ts`.
- **Planeación:** 4 archivos (encoding + botón preparar en `bloqueada`).
- **Clientes:** 7 archivos (IDOR, permisos, consumo/tier, crédito).
- **Cobranza/Gastos:** `cobranza/componentes/operacion-cobranza.tsx`,
  `gastos/{componentes/operacion-gastos.tsx,acciones/procesar-comprobante-ocr.ts}`.
- **Inventario:** `panel-inventario.tsx`, nuevo
  `sincronizador-inventario-realtime.tsx`.
- **Dashboard/Configuración/Comentarios/Pipeline:** mappers, stores, acciones y
  componentes según lo descrito arriba.
- **Estado:** `indice.ts`, `uso-tienda-dashboard.ts`; eliminados
  `uso-tienda-notificaciones.ts`, `uso-tienda-configuracion.ts`,
  `tienda-usuario.ts`.
- **Configuración de proyecto:** `tsconfig.json` (excluye la carpeta no
  relacionada `opencode-context-usage/`), `vitest.config.ts` (alias del stub
  `server-only`), `tests/mocks/server-only.ts`, tests ajustados.

### Migraciones

| Archivo | Contenido |
|---|---|
| `20260909224643_fase_9_rpc_gastos.sql` (editada) | Firma `timestamptz` en REVOKE/GRANT de `registrar_gasto` |
| `20260911000001_auditoria_corregir_grants_fase_9.sql` | Grants idempotentes para instalaciones parciales |
| `20260911000002_auditoria_ordenes_planeacion_produccion.sql` | Estados de OP, auto-completado, locks, reprogramación, asignación |
| `20260911000003_auditoria_cobranza_pipeline.sql` | Permisos de pago/saldo, idempotencia, MXN TC=1, ganada reconciliada, política INSERT pipeline |
| `20260911000004_auditoria_seguridad_rls_y_folios.sql` | PIN hash, RLS inventario/gastos, FKs, CHECKs, menciones UUID, secuencia, Realtime |
| `20260911000005_auditoria_dashboard_aging.sql` | Aging/CxP reales del periodo anterior |

---

## 7. 📋 Estado de fases pendientes y aplicación manual

### Fases implementadas localmente (no aplicadas al remoto)

| Fase | Migración(es) local(es) | Estado local | Requisito para aplicar |
|---|---|---|---|
| Fase 9 — Gastos/CxP/OCR | `20260909224637`, `20260909224640`, `20260909224643` | Implementada; grants corregidos | Aplicar en orden en SQL Editor/CLI con permisos de owner |
| Fase 10 — Dashboard | `20260910001120` | Implementada; aging anterior corregido por correctiva | — |
| Fase 11 — Configuración | `20260910011548` | Implementada | — |
| Fase 12 — Comentarios/Notificaciones | `20260910023504` | Implementada; validación UUID de menciones reforzada | — |

El bloqueo remoto es de **privilegios de la cuenta CLI (403)**; no es un defecto
de las migraciones. Mientras no se apliquen, las rutas `/gastos`,
`/dashboard`, `/configuracion` y el centro de notificaciones seguirán
apuntando a objetos que no existen en el remoto.

### Orden exacto de aplicación manual

```text
1. 20260909224637_fase_9_gastos_base.sql
2. 20260909224640_fase_9_motor_rentabilidad.sql
3. 20260909224643_fase_9_rpc_gastos.sql          ← ya corregido (timestamptz)
4. 20260910001120_fase_10_dashboard_base.sql
5. 20260910011548_fase_11_configuracion_base.sql
6. 20260910023504_fase_12_comentarios_base.sql
7. 20260911000001_auditoria_corregir_grants_fase_9.sql
8. 20260911000002_auditoria_ordenes_planeacion_produccion.sql
9. 20260911000003_auditoria_cobranza_pipeline.sql
10. 20260911000004_auditoria_seguridad_rls_y_folios.sql
11. 20260911000005_auditoria_dashboard_aging.sql
```

Notas de aplicación:

- Las correctivas 1–5 son idempotentes y con guardas
  (`to_regprocedure`, `pg_constraint`, `pg_publication_tables`), por lo que
  pueden re-ejecutarse sin efectos secundarios.
- Las correctivas 4 y 5 **dependen** de que Fases 9/12/10 estén aplicadas
  (`gastos`, `procesar_menciones_comentario`, `pagos_ar`, `cuentas_por_cobrar`).
- Si se aplicó Fase 9 sentencia por sentencia y `registrar_gasto` existe con
  grants abiertos, la correctiva 1 los cierra aunque la migración original haya
  fallado.
- Tras aplicar, verificar:
  - `SELECT proacl FROM pg_proc WHERE proname = 'registrar_gasto';` (solo
    `service_role`).
  - `SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
    WHERE table_name = 'usuarios' AND grantee = 'authenticated';` (sin
    `pin_operador`).
  - `SELECT * FROM pg_publication_tables WHERE tablename = 'movimientos_inventario';`
  - `supabase migration list --linked` para confirmar historial (cuando el 403
    esté resuelto).

---

## 8. Lista ordenada de correcciones (mayor → menor impacto)

1. **CRÍTICO-1** Grants de `registrar_gasto` (firma `date` → `timestamptz`) +
   correctiva idempotente.
2. **CRÍTICO-2** IDOR Pipeline→Clientes con cliente admin.
3. **CRÍTICO-3** Rate limiting evadible por `X-Forwarded-For`.
4. **CRÍTICO-4** Escape Unicode literal en Planeación (UI ilegible).
5. **ADV-1/2** Completar OP solo con todas las partidas producidas y
   auto-completado desde avance de piso (desbloquea cobranza).
6. **ADV-3/4** Orden de locks ABBA y cierre de sesión (deadlocks).
7. **ADV-5/6/7** Validaciones de estado en programación, reprogramación y
   reasignación de partidas.
8. **ADV-8/9/10** Permisos financieros en RPC, idempotencia estricta y MXN TC=1.
9. **ADV-11/12** Folio OP no fabricable y `ganada` reconciliada.
10. **ADV-13/14/15/16** Zustand vs TanStack, tier/crédito reales, permisos de
    crédito y sincronización Realtime.
11. **Refuerzos SQL** PIN hash invisible, RLS de inventario/gastos, FKs, CHECKs,
    menciones UUID, secuencia legada, aging anterior.
12. **MEJORA** Mensajes genéricos, mappers estrictos, enums validados, logs con
    códigos estables, `server-only`, errores de entrega tipados.
13. **Pendientes documentados:** atomicidad de cotización (ADV-P1), máquina de
    estados `borrador/aprobado` de Gastos (ADV-P2, decisión de producto),
    `materialSeleccionado` por ID en Zustand (M10).

---

## 9. Evidencia de verificación

```text
pnpm typecheck            → ExitCode 0, 0 errores
pnpm lint                 → ExitCode 0, 0 errores / 0 warnings
pnpm test                 → 47 archivos / 382 pruebas aprobadas
pnpm test:integracion     → 11 archivos / 47 pruebas aprobadas
pnpm build                → ExitCode 0, 16 rutas generadas
```

Riesgos residuales:

- Las migraciones correctivas **no fueron ejecutadas** contra PostgreSQL (sin
  base local y con el remoto bloqueado); su validación es por revisión estática
  y deben aplicarse primero en un entorno de ensayo si existe.
- El refuerzo de grants de columnas en `usuarios` asume que ningún cliente
  navegador lee `usuarios` directo (verificado en el código: todas las lecturas
  pasan por Server Actions con `service_role`).
- La correctiva de aging anterior usa el saldo actual como aproximación
  histórica (no existe histórico de saldos por fecha en el esquema vigente);
  es estrictamente mejor que el bucket único >90 anterior y queda documentado.
- E2E Playwright permanece opt-in y no se ejecutó en esta pasada.
