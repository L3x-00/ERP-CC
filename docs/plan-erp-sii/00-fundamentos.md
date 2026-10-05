# B0 — Fundamentos, arquitectura y estándares transversales

Referencias del documento del cliente: §§3 (principios), 4 (arquitectura funcional), 5 (roles), 6 (integridad), 7 (datos), 19 (plataforma), 23 (nota final).
Este bloque no entrega funcionalidad visible: entrega **decisiones, nomenclatura y patrones** que todos los bloques siguientes deben respetar.

---

## 0.1 Propósito y reglas de interpretación

1. El documento del cliente es normativo. Cada tarea de los bloques cita su sección.
2. Si el documento no define algo: conservar el comportamiento actual y registrar la decisión en §0.13 (pendiente PO). No inventar reglas.
3. Se permite **mejorar** la implementación técnica (índices, validaciones, ergonomía) siempre que no contradiga ni agregue reglas de negocio nuevas.
4. Toda capacidad nueva respeta estos principios:
   - **Captura única:** la información nace en un solo lugar y se hereda aguas abajo.
   - **Identidad estable:** ID interno inmutable + folio humano. Folio usado nunca se reutiliza (incluso cancelado).
   - **Historia antes que borrado:** cancelar/cerrar/desactivar; nunca eliminar silenciosamente.
   - **Acciones de negocio:** los estados cambian por acciones específicas del servidor.
   - **Snapshot por etapa:** una revisión enviada es reconstruible sin datos mutables del RFQ.
   - **Auditoría anexa:** usuario, fecha, entidad, acción y contexto (`correlationId`).
   - **Fallo seguro:** nunca fingir éxito; error explícito, sin pérdida/duplicación/sobrescritura.

## 0.2 Estado actual resumido (para no releer todo el sistema)

Stack: **Next.js 16 (App Router, RSC + Server Actions) + Supabase (Postgres, Auth, Storage, Realtime) + Zod v4 + TanStack Query + Zustand (solo UI)**, TypeScript estricto. Tests: Vitest (unitarias), pgTAP (`supabase test db`), integración JWT, concurrencia, Playwright E2E, CI en `.github/workflows/ci.yml`.

| Área | Hoy | Reutilizable en el plan |
|---|---|---|
| Clientes | `clientes` + `contactos_cliente` (un principal por índice parcial), crédito/tier, documentos bucket privado, sin folio CLI, sin moneda/días crédito | UI ficha, acciones, crédito, RLS |
| Comercial | `pipeline` (oportunidad: 6 etapas, `folio_op OP-####`, `folio_cnc CNC-MMYY-####`) + `cotizacion_lineas` + `calculo_tecnico` snapshot | Líneas, folio CNC, CAS, promotor a cliente |
| Aprobación | `aprobar_oportunidad_y_crear_orden`: genera `OP-######` + AR no cobrable, idempotente, locks y gate de crédito | Base para B5 (con nuevo origen por revisión) |
| Órdenes | `ordenes_produccion` + `partidas_orden_produccion`, edición CAS en borrador, archivado al entregar, TI por bandera | Base para B5 |
| Planeación | `recursos_planeacion`, capacidades por turno, `programacion_areas`, CAS y locks | Base para B6 |
| Producción | `sesiones_trabajo` (iniciar/pausar/cerrar), PIN operador, `metas_proceso_partida` + avance por proceso (PRD-09), archivos de sesión | Base para B6/B7 |
| Entregas | `notas_entrega` parciales `NE-######`, `partidas_nota_entrega`, dispara activación de AR | Base para B7 |
| Cobranza | AR + pagos idempotentes (`solicitud_id`), reversos, anulación, anticipos, monedero, aging | Base para B8 |
| Gastos | `gastos` `GTO-######`, OCR, comprobantes, rentabilidad | Base para B8 |
| Sistema | 5 roles fijos, 14 permisos genéricos, `logs` + Bitácora admin, catálogos parciales, buckets privados | Base para B1 |

Folios vigentes: `OP-####` (pipeline), `CNC-MMYY-####`, `OP-######` (orden), `NE-######`, `REC-######`, `GTO-######`, `INVCNC-#######`, inventario `<PREFIJO>-######`.
Patrones vigentes que se conservan: folios atómicos `SECURITY DEFINER` solo `service_role`; CAS con `actualizado_en` esperado; idempotencia por `solicitud_id`/único parcial; locks ordenados documentados; RLS solo lectura para `authenticated`; mutaciones vía Server Actions + `service_role`; auditoría `registrar-log`; Realtime sin payloads.

## 0.3 Mapeo terminológico documento ↔ sistema

| Documento (cliente) | Hoy en el sistema | Decisión del plan |
|---|---|---|
| RFQ | `pipeline` (oportunidad + cotización fusionadas) | `pipeline` se convierte en **cabecera RFQ**; se agregan `estado_rfq`, `folio_rfq`, ítems. Ver ADR-SII-01 |
| Ítem RFQ (ITxx) | `cotizacion_lineas.orden` | Nueva tabla `rfq_items` con `codigo` ITxx por RFQ, nunca reutilizado |
| Propuesta | No existe | Nueva tabla `propuestas` (folio `CNC-MMYY_XX`) |
| Revisión A/B/C | No existe | Nueva tabla `propuesta_revisiones` (letra A..Z) |
| Ítem de propuesta | `cotizacion_lineas` (+ precio) | Nueva tabla `propuesta_items` ligada a revisión y a `rfq_item_id` (conserva ITxx) |
| Operación solicitada | `cotizacion_lineas.procesos text[]` | Nueva tabla `rfq_item_operaciones` / `propuesta_item_operaciones` contra catálogo |
| Ruteo estimado | No existe (solo `metas_proceso_partida` en piso) | Nueva tabla `propuesta_item_ruteo` (proceso, secuencia, grupos, setup/run/total) |
| Orden de trabajo | `ordenes_produccion` | Nace de `accepted_revision_id` + snapshot; folio `O-MMYY_XX` (históricos `OP-` se conservan) |
| Orden interna | `es_interna` con mismo folio | Folio `OI-MMYY_XX` además de la bandera |
| Corrida | No existe | Nueva tabla `corridas` + `corrida_items` |
| Entrega NE-MMYY_XX-YY | `notas_entrega` `NE-######` | Nueva columna `folio_sii`; históricos conservan `NE-######` |
| Recibo RP-MMYY_XX-YY | `pagos_ar.folio_recibo REC-######` | Nueva columna `folio_sii`; históricos conservan `REC-` |
| Compra/Gasto CG-MMYY_#### | `gastos.folio GTO-######` | Nueva columna `folio_sii` |
| Cliente CLI-#### | No existe | Nueva columna `folio` en `clientes` + backfill |
| Actividad | Bitácora admin en Configuración | Vista `/actividad` con permisos, `correlationId`, sin IDs técnicos |

## 0.4 Arquitectura objetivo

```
Comercial          Operación                Logística       Finanzas
Clientes → RFQ → Propuestas → Órdenes → Planeación → Producción → Calidad → Entregas → Facturación → CxC → Tesorería
                    │            │                                                        └→ Compras/Gastos/CxP → Tesorería
                    │            └── nace de acceptedRevisionId + snapshot
                    └── Revisión SENT congelada; nueva revisión = copia + motivo
Sistema transversal: Usuarios/Roles/Permisos · Catálogos configurables · Actividad · Archivos privados versionados
```

Regla de secuencia de datos: `RFQ_item (ITxx)` → `propuesta_item (ITxx)` → `orden item (ITxx)` → `entrega/corrida`. El código ITxx es la columna vertebral de trazabilidad.

## 0.5 ADRs propuestos (decisiones de arquitectura)

Formato: contexto → decisión → alternativas → consecuencias → estado.

### ADR-SII-01 — Modelo RFQ/Propuesta sobre el comercial actual
- **Contexto:** `pipeline` fusiona RFQ + propuesta sin revisiones ni congelamiento; el documento exige separar y versionar.
- **Decisión:** evolucionar en sitio. `pipeline` pasa a ser cabecera RFQ (se conserva la tabla, RLS, Realtime y folio interno `folio_op` como referencia histórica; se agrega `folio_rfq`). Se crean `rfq_items`, `propuestas`, `propuesta_revisiones`, `propuesta_items`, `propuesta_item_operaciones`, `propuesta_item_ruteo`, `propuesta_revision_costos`, `propuesta_pdfs`, `propuesta_revision_acciones`. Backfill: cada RFQ existente con líneas genera su revisión A DRAFT/SENT según etapa; con orden vinculada genera revisión A ACCEPTED y `accepted_revision_id`.
- **Alternativas descartadas:** (a) renombrar tablas físicas `pipeline`→`rfqs` (rompe RPCs, triggers, publicaciones Realtime y ~100 referencias; alto riesgo); (b) crear RFQ nuevas y dejar `pipeline` como legacy (duplica fuente de verdad).
- **Consecuencias:** doble nomenclatura transitoria documentada; `cotizacion_lineas` queda como tabla legacy de solo lectura tras el backfill y se elimina en una limpieza posterior autorizada.

### ADR-SII-02 — Esquema de folios del documento
- **Contexto:** formatos exigidos (RFQ-MMYY_XX, CNC-MMYY_XX-A, O-/OI-MMYY_XX, NE-/RP-MMYY_XX-YY, CG-MMYY_####, CLI-####, ITxx) distintos de los actuales.
- **Decisión:** adoptar el formato del documento para **documentos nuevos**; los históricos conservan su folio (grandfathering). Implementar un generador genérico `generar_folio_periodico(p_tipo text)` sobre `contador_folios` (clave `tipo|MMYY`), con tope y error `folio_periodo_agotado`, sin reutilización. Nuevas columnas `folio_sii` (nullable, único) cuando la columna existente tiene CHECK: no se relaja el CHECK histórico.
- **Consecuencias:** dos formatos conviven; toda UI muestra `folio_sii ?? folio`. La pestaña Folios de Configuración se generaliza a todos los tipos con continuidad administrativa (nunca retroceder).

### ADR-SII-03 — Origen de la Orden
- **Contexto:** hoy la orden nace de `etapa='negociacion'` con las líneas vivas.
- **Decisión:** la orden nace **solo** de una `propuesta_revision` con estado `ACCEPTED` (`SALE_CONFIRMED` para fines comerciales), guardando `accepted_revision_id`, `propuesta_id`, `rfq_id` y un snapshot suficiente (ítems, cantidades, materiales, espesores, operaciones, ruteo, archivos vivos referenciados). La aprobación actual se reemplaza por la acción "Aceptar revisión y confirmar venta".
- **Consecuencias:** cambios posteriores en RFQ/propuesta no alteran la orden; toda modificación posterior se registra con trazabilidad.

### ADR-SII-04 — PDF de propuesta
- **Contexto:** el documento exige PDF por revisión, privado, excluyente de datos internos; hoy no hay generación de PDF.
- **Decisión:** generar en servidor (Server Action) un PDF real desde plantilla HTML+CSS controlada. Spike obligatorio en B4.6 con dos opciones: `@react-pdf/renderer` (default tentativo, Node puro) vs Chromium headless/puppeteer (si la fidelidad exige). Criterios: sin llamadas externas en runtime, determinista, sin filtrar campos internos, almacenado en bucket privado, regenerable, idempotente por revisión.
- **Consecuencias:** nueva dependencia acotada; el PDF se regenera si cambia una revisión DRAFT; para SENT es inmutable (no se regenera; nueva revisión = nuevo PDF).

### ADR-SII-05 — Permisos por acción
- **Contexto:** 14 permisos genéricos y CHECK con lista fija; el documento pide permisos por acción (`PROPUESTA_*`, etc.) aplicados en servidor.
- **Decisión:** crear catálogo `permisos` (código PK, módulo, descripción, activo) + `permisos_rol` con FK (sin CHECK enumerado). Migrar los 14 actuales y agregar el conjunto nuevo por módulo (§1.2). `can()` y `privado.usuario_tiene_permiso` leen igual (los permisos se resuelven por BD). Los permisos retirados se desactivan, nunca se borran.
- **Consecuencias:** altas de permisos sin migración de CHECK; matriz rol×permiso administrable en Configuración (UI en B1.2).

### ADR-SII-06 — Archivos privados con metadatos y versionado
- **Contexto:** buckets con metadata desigual; solo comprobantes de gasto tienen historial de reemplazo.
- **Decisión:** tabla genérica `archivos` (entidad, entidad_id, tema, clase, nombre_original, nombre_erp, ruta_storage única, mime, tamaño, version, reemplaza_a, vigente, subido_por, creado_en) + RLS de lectura por permiso de la entidad; storage privado con límites de tamaño/MIME a nivel bucket; URL firmada corta; reemplazo siempre trazado (`reemplaza_a` + versión anterior `vigente=false`). Los buckets específicos actuales se conservan; `adjuntos-cotizacion` migra su metadata.
- **Consecuencias:** una sola forma de vincular archivos a entidad/revisión/ítem; no hay borrado silencioso.

### ADR-SII-07 — Estados por acción, no por update libre
- **Contexto:** hay transiciones por acciones pero también cambios manuales (p. ej. botones "Iniciar" de la orden).
- **Decisión:** cada máquina de estados (RFQ, propuesta/revisión, orden, corrida, entrega) vive en SQL: una RPC por acción, con validación de estado de origen, permisos, CAS y auditoría. La UI solo ofrece acciones válidas para el estado actual. Los campos de estado no se aceptan como parámetro libre.
- **Consecuencias:** se eliminan menús genéricos de cambio de estado; cualquier automatismo (derivar estado de la orden por avance) se implementa por trigger/RPC, nunca por edición del campo.

### ADR-SII-08 — Auditoría con correlationId
- **Contexto:** `logs` no agrupa eventos de una misma acción; la Bitácora es admin-only.
- **Decisión:** agregar `correlation_id uuid` a `logs` (con índice), generarlo por acción de negocio y propagarlo a eventos hijos. Nueva vista `/actividad` con permiso `ver_actividad`, filtros, paginación estable y enlaces a la ficha de la entidad (nunca mostrar UUID crudo: resolver a folio/nombre). La bitácora admin actual se mantiene.
- **Consecuencias:** trazabilidad de acciones multiregistro; base para depuración.

### ADR-SII-09 — Migración de datos existentes (grandfathering)
- **Contexto:** hay datos productivos con folios y estados viejos.
- **Decisión:** toda migración es aditiva y no destructiva; el backfill se ejecuta en la misma transacción de la migración y es idempotente. Los registros históricos conservan folio y estado mapeado a los nuevos estados (tabla de equivalencias en cada bloque). No se elimina ninguna tabla/columna en este plan; la limpieza se planifica aparte y con autorización explícita.

## 0.6 Nomenclatura maestra de folios

| Entidad | Formato nuevo | Generador | Histórico (grandfather) |
|---|---|---|---|
| RFQ | `RFQ-MMYY_XX` | `generar_folio_periodico('RFQ')` | `folio_op OP-####` |
| Propuesta/revisión | `CNC-MMYY_XX-A`…`-Z` (sufijo = revisión) | contador `CNC` + letra de revisión | `folio_cnc CNC-MMYY-####` |
| Orden | `O-MMYY_XX` | `generar_folio_periodico('O')` | `OP-######` |
| Orden interna | `OI-MMYY_XX` | `generar_folio_periodico('OI')` | bandera `es_interna` |
| Entrega | `NE-MMYY_XX-YY` (XX orden, YY parcial) | derivado de orden + consecutivo de entregas | `NE-######` |
| Recibo de pago | `RP-MMYY_XX-YY` | `generar_folio_periodico('RP')` + consecutivo | `REC-######` |
| Compra/Gasto | `CG-MMYY_####` | `generar_folio_periodico('CG')` | `GTO-######` |
| Cliente | `CLI-####` | secuencia global atómica | — |
| Ítem | `IT01`…`IT99` (por RFQ) | contador por RFQ | `cotizacion_lineas.orden` |
| Corrida | `<PROC>-NN` (LAS01, DOB01, ROU01…) por orden | contador por orden y prefijo de proceso | — |
| AR (interno) | `INVCNC-#######` | ya existe | — |

Reglas: folio atómico (nunca `último+1` en cliente); nunca reutilizar; tope con error explícito y ajuste administrativo auditado.

## 0.7 Modelo de datos objetivo (entidades)

Existentes que se conservan: `clientes`, `contactos_cliente`, `pipeline` (→RFQ), `ordenes_produccion`, `partidas_orden_produccion`, `programacion_areas`, `recursos_planeacion`, `sesiones_trabajo`, `notas_entrega`, `partidas_nota_entrega`, `cuentas_por_cobrar`, `pagos_ar`, `gastos`, `logs`, `configuracion_sistema`, `areas_trabajo_config`, `cuentas_bancarias`, `comentarios_registro`.

Nuevas por bloque:
- B1: `permisos`, `catalogo_materiales`, `catalogo_espesores`, `catalogo_procesos`, `grupos_equipo`, `grupos_planeados`, `catalogo_proximas_acciones`, `archivos`, `catalogo_motivos_pausa`, `versiones_catalogo` (histórico de cambios de catálogo).
- B2: `clientes.folio`, `clientes.moneda`, `clientes.dias_credito`, `clientes.credito_habilitado`; documentos migrados a `archivos`.
- B3: `rfq_items`, `rfq_item_operaciones`, `rfq_eventos` (bitácora de cambios de estado del RFQ).
- B4: `propuestas`, `propuesta_revisiones`, `propuesta_items`, `propuesta_item_operaciones`, `propuesta_item_ruteo`, `propuesta_revision_costos`, `propuesta_pdfs`, `propuesta_revision_acciones`.
- B5: `ordenes_produccion.accepted_revision_id`/`propuesta_id`/`snapshot_json`, `ordenes_produccion.folio_sii`; `ordenes_produccion.snapshot` suficiente para fabricar.
- B6: `corridas`, `corrida_items`, `sesiones_trabajo.corrida_id`, `inspecciones_calidad`, `autorizaciones_hora_extra`; motivos de pausa desde catálogo.
- B7: `notas_entrega.folio_sii`, `entregado_por_id`, vínculo de evidencias/firma en `archivos`.
- B8: diseño de `facturas`, `aplicaciones_pago` (many-to-many), `promesas_pago`, `compras`, `movimientos_tesoreria`, `transferencias_tesoreria`.

El detalle de columnas, índices, constraints y RLS de cada entidad vive en su bloque.

## 0.8 Patrones obligatorios de ingeniería (checklist)

**SQL**
- `SECURITY DEFINER SET search_path = ''` + `REVOKE ALL FROM PUBLIC/anon/authenticated` + `GRANT EXECUTE` solo a `service_role`, salvo RPC que requiere JWT del usuario (se usa `auth.uid()` dentro de la función y se documenta).
- Permisos validados **dentro** de la RPC cuando el actor lo pasa la app (defensa en profundidad) y en la Server Action con `can()`.
- Locks en orden determinista documentado en el encabezado de la función; `FOR UPDATE`/`FOR KEY SHARE` según necesidad; `pg_advisory_xact_lock` para unicidad lógica.
- CAS: token `actualizado_en` esperado; error tipado `*_desactualizado`/`*_conflicto`; reintento idempotente donde aplique.
- Idempotencia: `solicitud_id` único o clave natural única (nunca doble creación).
- Índices únicos parciales para candados (una sesión activa, un PDF vigente por revisión, un contacto principal).
- CHECKs de formato de folio **solo** para columnas nuevas; no relajar CHECKs históricos.
- Triggers `actualizar_timestamp` y de inmutabilidad (revisión SENT, folio, referencia interna).
- RLS: `authenticated` solo SELECT con permiso; sin políticas de escritura.
- `COMMENT ON` para entidades/funciones nuevas; publicar en Realtime solo tablas que la UI observe (sin payloads).

**TypeScript**
- Zod v4 strict en el borde de cada Server Action; errores tipados con códigos estables (`ya_existe`, `estado_invalido`, `sin_permiso`, `desactualizado`…).
- Sin lógica de negocio en el cliente; mappers defensivos para tipos generados; nunca `any`.
- TanStack Query: invalidar claves afectadas tras mutaciones; Realtime solo como señal de refetch.
- Componentes según estándar UX §17 (cola → ficha → formulario → acción; acciones de negocio arriba).

**Archivos**
- Bucket privado, límites de tamaño/MIME a nivel bucket, metadata en `archivos`, URL firmada ≤300 s, reemplazo trazado, sin borrado silencioso.

**Auditoría**
- Toda acción de negocio registra `registrar-log` con `correlationId`, entidad, acción y contexto legible; la UI de Actividad no muestra UUID crudos.

## 0.9 Estrategia de pruebas y CI

| Nivel | Herramienta | Obligación por bloque |
|---|---|---|
| SQL | pgTAP (`supabase test db`) | estados, permisos, CAS, idempotencia, inmutabilidad, folios |
| Unitaria | Vitest | servicios/reglas puras (transiciones, cálculos, validaciones) |
| Integración | Vitest + JWT local | Server Actions + RPC contra Supabase local |
| Concurrencia | `pnpm test:concurrencia` | dobles peticiones donde hay locks/idempotencia |
| E2E | Playwright | flujo completo del bloque + regresión de bloques previos |
| Visual | capturas | pantallas nuevas en 1440/768, claro/oscuro |
| CI | `.github/workflows/ci.yml` | todo lo anterior en verde antes de aceptar |

Regla: ninguna prueba mutante contra remoto. Entorno local con Supabase CLI; `.env.local` es producción (nunca usarlo para pruebas).

## 0.10 Proceso de trabajo (AGENTS.md)

- Codex orquesta, define alcance, revisa, verifica e integra (Git, PRs, migraciones remotas).
- Claude Code implementa solo el encargo delegado y entrega evidencia; no hace Git de integración ni acciones remotas.
- Ramas sugeridas: `codex/sii-b<bloque>-<slug>`; un PR por bloque o sub-bloque verificable.
- Al cerrar: `cross-review` (skill) para cambios relevantes, actualización de `PROJECT_STATE.md`/`ACTIVE_TASKS.md` por Codex, y registro de riesgos.

## 0.11 Riesgos globales y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Doble fuente de verdad RFQ/Propuesta durante la transición | Alto | ADR-SII-01: backfill en la misma migración + UI solo escribe modelo nuevo + legacy de solo lectura |
| Folios duplicados al convivir formatos | Medio | columnas `folio_sii` separadas; únicos por columna; contadores por tipo |
| Rendimiento de `contador_folios` con muchos tipos | Bajo | PK compuesta `(tipo, periodo)` + UPSERT (ya probado) |
| PDF server-side pesado | Medio | spike B4.6 con criterios; bucket privado; cache por revisión |
| Cambios de estado derivados (orden) vs acciones manuales | Alto | ADR-SII-07: derivación en RPC/trigger; UI sin dropdown |
| Romper flujos actuales de producción/cobranza | Alto | migraciones aditivas, grandfathering, regresión E2E por bloque |
| Migraciones locales sin aplicar en remoto | Medio | checklist de bloque: listar migraciones y estado; el PO aplica |

## 0.12 Decisiones del cliente (resueltas 2026-10-05)

Todas las decisiones abiertas fueron respondidas por el cliente; el detalle está en `09-estrategia-y-kpis.md` (anexo). Resumen: precios/ruteo los edita Customer Service y costo/margen solo Management/Admin; órdenes internas por alta directa autorizada; archivos para LISTO y primera pieza configurables por proceso; lotes según proceso; máquina reclamable tras 1 h de pausa con traza; horas extra sobre la jornada configurada del turno (por definir) con autorización Management/Admin; cierre administrativo al 100 % entregado; entregas industriales con hoja firmada digitalizada y no industriales con firma digital preferente; sin margen mínimo bloqueante.

**Único pendiente:** jornada exacta por turno (B6, no bloquea B0/B1).

## 0.13 Tareas de B0

| ID | Tarea | Entregable | Aceptación |
|---|---|---|---|
| SII-B0.1-01 | Aprobar/rechazar ADRs de §0.5 con el PO | ADRs marcados `ACEPTADO` | Firmado en este doc |
| SII-B0.2-01 | Congelar nomenclatura maestra §0.6 | Tabla §0.6 | Sin cambios posteriores sin ADR |
| SII-B0.3-01 | Congelar checklist §0.8 | Checklist | Usado en cada bloque |
| SII-B0.4-01 | Definir plantilla de migración/backfill idempotente | Plantilla SQL en `supabase/migrations` | Aprobada en B1 |
| SII-B0.5-01 | Definir plantilla de tarea/evidencia handoff | Plantilla en README | Usada desde B1 |
