# Continuidad — Auditoría de cumplimiento por bloques (plan SII)

> Punto de control persistente. Se actualiza después de cada paso. Si la sesión se corta
> (límite de uso o cierre), se reanuda desde **Siguiente paso**. El hook
> `~/.claude/usage-guard/guardian.js` (PostToolUse/SessionStart en `.claude/settings.json`)
> ordena registrar aquí el avance cuando el uso de la suscripción llega al 90 %.

## Estado

| Campo | Valor |
|---|---|
| Bloque en curso | **B1 — Sistema** (usuarios/roles, permisos por acción, catálogos, archivos, Actividad) |
| Situación | **EN PAUSA DE CONTROL** desde 2026-10-07 ~16:15 por orden del PO (ver "Pausa de control") |
| Rama | `auditoria/b1-sistema` (desde `main` en `6e3b33c`); último código `fba32cf`, local y sin push |
| Línea base | `b71d9e0` (cierre del plan) + `6e3b33c` (documento del cliente versionado) |
| Fuente de verdad | `docs/ERP_SII_Handoff_Tecnico_Funcional.md` → decisiones del cliente → plan |
| Proceso | skill `.claude/skills/auditoria-cumplimiento-cliente/SKILL.md` |
| Requisitos B1 | R-B1-01 … R-B1-50, persistidos en `B1-requisitos.md` |
| Reglas | Corregir defectos con prueba; migración nueva (nunca editar aplicada) solo en local; commits atómicos locales sin push; fuera de alcance solo se propone; no tocar B2–B9 (se difiere) |

## Historial de pasos

| Fecha/hora | Paso | Resultado |
|---|---|---|
| 2026-10-06 | Commit de cierre `b71d9e0` y documento del cliente `6e3b33c` | Hecho |
| 2026-10-06 | Workflow de 10 lentes `wf_5e9fab30-a60` | **Falló**: límite de sesión (11/11 agentes sin resultado; nada recuperable) |
| 2026-10-07 | Guardián de uso (hook) + rama + este archivo | Hecho |
| 2026-10-07 | Pruebas de B1 (propias) | pgTAP 94/94 (permisos 16, archivos 11, catálogos 40, actividad 27) · unitarias B1 53/53 |
| 2026-10-07 | Revisión git de B1 (propia) | Migraciones B1 nunca editadas tras su commit (1 commit c/u); sin secretos en diffs; commits mezclados: `452bfcf` (B1.10 + B3 ola 1) y `d10ecf5` (catálogos + retrofit en 45 archivos/9 módulos) → hallazgo de proceso, sin reescritura |
| 2026-10-07 | Tanda 1 de lentes (L1 roles/permisos, L2 catálogos) — workflow `wf_797b616a-06e` | Hecho: 27 hallazgos → `B1-hallazgos.md` (10 de B1 a corregir, 13 diferidos, 4 propuestos) |
| 2026-10-07 | Tanda 2 de lentes (L3 archivos, L4 Actividad/UX/alcance) — workflow `wf_be9bc2c3-f72` | En curso (si se corta por límite: `Workflow({scriptPath: <script de wf_797b616a-06e>, resumeFromRunId: "wf_be9bc2c3-f72", args: ["L3","L4"]})` reutiliza lo terminado) |
| 2026-10-07 | Corrección RBAC (H-B1-03/05/06/07/09/13) — commit `ac35c5b`, migración `20261008000001` (solo local) | Hecho: pgTAP 24/24 + 16/16, concurrencia 2/2, unitarias 962/962, typecheck/lint 0. H-B1-02 diferido a B2/B3/B4 (otorgar permisos legacy abriría mutaciones) |
| 2026-10-07 | Guardián probado en sesión real: aviso al 83 % (5 h, reinicia 13:30) | Pausa preventiva: sin lanzar trabajo nuevo hasta el reinicio |
| 2026-10-07 | Tanda 2 terminada (`wf_be9bc2c3-f72`, 2/2 agentes) | 18 hallazgos registrados como H-B1-29..46 "Por clasificar" en `B1-hallazgos.md` (1 Crítico: subidas limitadas a 1 MB). **PAUSA al 89 %** hasta el reinicio de las 13:30 |
| 2026-10-07 | Sesión Claude Code identificada y tanda 2 clasificada por Codex | Sesión `4c6ad8e4-b953-453d-b80b-86bd0dfd758c`, modelo comprobado `claude-opus-5-5`; 7 bloqueantes B1, 6 no bloqueantes B1, 2 diferidos a B3, 2 propuestas PO y H-B1-44 consolidado con H-B1-24. Límite 5 h comprobado en 90 %, reinicio `2026-10-07 13:29:59 -05:00` |
| 2026-10-07 | Auditoría reanudable endurecida | Requisitos R-B1-01..50 persistidos en `B1-requisitos.md`; Skill promovida a la fuente canónica `.agents/skills/auditoria-cumplimiento-cliente/` con tandas pequeñas y checkpoint obligatorio |
| 2026-10-07 | Actividad H-B1-38 | Resuelto en `3035dfa`: el cursor se aplana al contrato de la Server Action; prueba roja/verde de componente, typecheck, lint focal y 963/963 unitarias |
| 2026-10-07 | Actividad H-B1-39 | Resuelto en `b97944f`: RFQ prioriza `folio_rfq`; Propuestas, Producción y Tesorería muestran referencias legibles y enlaces seguros; migración `20261008000003` aplicada solo local; pgTAP 35/35 |
| 2026-10-07 | Actividad H-B1-40 | Resuelto en `4b51ac3`: `logs` queda append-only por privilegios mínimos y triggers contra UPDATE/DELETE/TRUNCATE; migración `20261008000004` solo local; pgTAP global 1160/1160 |
| 2026-10-07 | Archivos H-B1-32/33 | Resueltos en `e9da561`: retirar un adjunto conserva binario e historial, authenticated ya no inserta/elimina directo en los buckets transversales y Producción acepta rutas legacy o `rfq/<id>/…`; migración `20261008000005` solo local; 12/12 unitarias focales, 964/964 unitarias globales y pgTAP global 1167/1167 |
| 2026-10-07 | Archivos H-B1-29 (encargo de Codex a Claude) | **Parcial** en `fba32cf`: subida directa a Storage con URL firmada en 6 de 7 flujos; integración local 10/10, unitarias 966/966, typecheck y lint 0. Falta documentos de cliente y E2E > 1 MiB (detalle en "Entrega parcial H-B1-29") |
| 2026-10-07 | Entregables y lock de Skills versionados a pedido del PO | `356d275` (auditoría global 2026-09-22 + informe hito 4) y `3866ec7` (`skills-lock.json`) |
| 2026-10-07 ~16:15 | **Pausa de control del PO** | Nueva tarea prioritaria: observaciones del cliente, que corrigió su documento a partir de observaciones. La auditoría queda congelada aquí |

## Punto de control 2026-10-09 — observaciones del cliente (trabajo activo; la auditoría B1–B9 sigue en pausa)

### Punto de control 2026-10-10 — C4.3 completo localmente

- Rama `feature/c4-3-confidencialidad-ordenes`, apilada sobre C4.2/PR #36.
- C4.3 elimina Editar/Procesos/Seleccionar/Ajustar de Órdenes y conserva comentarios por Orden;
  rutas, documentos y cancelación quedan sujetos a `orden_vista`, `ver_finanzas` y
  `orden_cancelar`, respectivamente.
- La migración `20261010010303_c4_3_confidencialidad_ordenes.sql`, aplicada solo en Supabase
  local, retira SELECT completo a `authenticated` y concede listas positivas: Operación no puede
  leer snapshot/importes/condición de pago, costo/tarifa de recursos ni costo histórico de sesión.
- Gates locales: pgTAP 17/17, unitarias focales 52/52, integración 10/10, E2E Producción 2/2,
  typecheck, lint focal y build del E2E. El E2E de Órdenes y Comentarios ya había quedado 2/2 en
  la misma rama antes del ajuste final de sesiones.
- Cross-review Codex: se corrigieron dos HIGH (Server Action de documento sin `orden_vista` y
  costo histórico de sesión expuesto). La prueba mutante de autorización falló 3/3 al debilitar
  el gate y volvió a verde tras restaurarlo. Claude Code intentó la revisión solo lectura con
  `claude-opus-5-5`, sesión `29f437a1-2103-4d06-bf62-59f622160c5c`, pero agotó el límite semanal
  sin entregar informe; no se le atribuye aprobación.
- Pendiente: push/PR/CI, aplicación remota coordinada después de C4.2, despliegue y aceptación PO.
  No usar `db push` mientras el historial remoto siga divergido.

Uso semanal al registrar: 90 % (reinicio 2026-10-13 04:00). Rama `feature/observaciones-cliente`.

- **Fusionado a `main` por el PO:**
  - PR #31: P0, C1, C2, C3.1 y correcciones de CI.
  - PR #32: C3.2 tarifas y `docs/CUELLOS-DE-BOTELLA.md`.
- **PR #33 (abierto):**
  - C3.3: costeo de ruteo congelado sin doble conteo (`3f44551`).
  - C3.3b: máquina por renglón, en el commit siguiente de esta misma rama.
- **Migraciones para aplicar en remoto con el despliegue del PR #33, en orden:**
  1. `20261009160000_c3_3_snapshot_costeo_ruteo.sql`
  2. `20261009170000_c3_3b_recurso_en_ruteo.sql`

  Las anteriores (hasta `20261009140000`) las aplicó el PO a mano. El historial `supabase_migrations` remoto no las refleja: no usar `db push` sin `migration repair` (ver `docs/CUELLOS-DE-BOTELLA.md`).
- **C3.3b y H-B1-29 cerrados** (máquina por renglón; documentos de cliente por subida directa).
- **C4.1 completo** (`b88d439` servidor + `63d27be` UI «Orden pendiente» con Reintentar). Solo falta la prueba de integración con dos conexiones que procesan la misma solicitud a la vez. Para armar el fixture conviene usar las RPC (`crear_propuesta` → enviar → `aceptar_revision`), porque los triggers de B4 bloquean cambios directos de estado vía API.
- **C4.2 completo localmente** en `feature/c4-2-orden-operativa`: snapshot/partidas comerciales inmutables; `fecha_compromiso_comercial` separada de `fecha_operativa`; prioridad, recurso y notas operativas con actor, motivo, CAS e historial. Migración `20261009193327_c4_2_orden_comercial_operativa.sql` solo local. Gates: pgTAP 104/104, focal 60/60, E2E Orden 1/1 y Planeación 2/2, tipos/lint/build. Falta commit, PR/CI, remoto, despliegue y aceptación.
- **Siguiente corte después de integrar: C4.3**, incluyendo privacidad de `recursos_planeacion.costo_hora_interno`.
- **PR #33 abierto** con C3.3, C3.3b, H-B1-29 y C4.1. Migraciones a aplicar en remoto, en orden: `20261009160000`, `20261009170000`, `20261009180000`.
- **Decisión tomada (contrato §6):** aceptar + congelar la fecha + crear la solicitud van en una transacción; la Orden la crea `procesar_solicitud_orden` (permiso `orden_liberar`, idempotente), así que el comercial no necesita `orden_liberar` para aceptar.
- *(Histórico)* Siguiente que se tenía: C4.1, aceptación durable y «Orden pendiente».
  - `crear_orden_desde_revision` exige `orden_liberar`, que el comercial no tiene. Definir si la Orden se crea con el actor que acepta o por un proceso con permiso propio, antes de escribir la solicitud única (`PENDING/BLOCKED/CREATED`) y el reintento idempotente.
  - Separar `fecha_compromiso_comercial` (contrato §3.1/§6).
- **Pendientes menores:**
  - Revisión financiera del costeo C3.3.
  - Conversión de moneda en el costeo (hoy se bloquea con `tarifa_moneda_distinta`).
  - Riesgo para C4.3: `recursos_planeacion.costo_hora_interno` es legible con `ver_planeacion`.

## Remoto verificado 2026-10-08 (`supabase migration list --linked`, solo lectura)

El historial remoto termina en `20260912000001`. Faltan **108** versiones locales en ese historial: desde `20260914044042` hasta `20261008170000`. Antes de `db push`: comprobar si alguna se aplicó a mano por SQL Editor (objetos existentes sin fila en el historial) y, en ese caso, reconciliarla con `supabase migration repair --status applied <versión> --linked`. Aplicar junto con el despliegue del código de `feature/observaciones-cliente`. Pausa por límite de uso (97 %).

### Comparación de esquema local vs remoto (2026-10-08, solo lectura)

El PO aplicó las migraciones pegándolas en el SQL Editor. Comparé la huella (funciones, columnas, triggers, políticas e índices) con `supabase db query --linked -f huella.sql`; el script está en el scratchpad de la sesión. Resultado: local 1533 elementos, remoto 1483.

- **No aplicadas en remoto:**
  - `20260925110000_a20_ar16_cfg12.sql`: faltan `anular_cuenta_por_cobrar`, `consolidar_ar_faltantes`, `previsualizar_consolidacion_ar_faltantes`, `privado.monto_comercial_orden` y las columnas `cuentas_por_cobrar.anulada_en/anulada_por/motivo_anulacion`.
  - `20261008131134`, `20261008160000` y `20261008170000`.
- **Aplicada con otro contenido:** `20261007130002_sii_b6_produccion_acciones.sql`. `cerrar_jornada`, `crear_corrida`, `registrar_inspeccion`, `iniciar_sesion_trabajo_operador` y `privado.corrida_siguiente_codigo` difieren del archivo, que tiene un único commit `247fe31`. Pendiente: comparar los cuerpos.
- **Deriva antigua:** al remoto le falta el índice único `proveedores_rfc_key` (de `20260707000002`, que sí figura en el historial).
- **Siguiente:** confirmar la diferencia de B6. Luego `migration repair --status applied` para las 104 restantes, y aplicar en orden las 4 faltantes (más B6 si corresponde) junto con el despliegue.

## Pausa de control (2026-10-07) — cómo reanudar

1. **Motivo:** el PO prioriza la tarea "observaciones del cliente". El cliente corrigió requisitos, así que la fuente de verdad de esta auditoría puede haber cambiado.
2. **Antes de tocar código al reanudar:**
   - Comparar la versión corregida del documento del cliente con `docs/ERP_SII_Handoff_Tecnico_Funcional.md` (versionado en `6e3b33c`) y con lo que haya implementado la tarea de observaciones.
   - Re-validar R-B1-01..50 de `B1-requisitos.md`: marcar requisitos cambiados, hallazgos obsoletos y hallazgos que la tarea nueva ya resolvió. Registrar el resultado en este archivo.
   - Recién entonces seguir el "Siguiente paso".
3. **Migración vacía resuelta:** Codex eliminó `supabase/migrations/20261007164257_sii_b1_catalogos_actor_concurrencia.sql` al iniciar esta pausa. Cuando se retome catálogos, crear una migración nueva posterior a `20261008000005`.
4. Para pruebas de integración: `supabase status -o env` → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sin imprimir valores; abortar si la URL no es loopback). Nunca `.env.local`.

## Plan global de la auditoría (B1 → B9)

Proceso por bloque (Skill `auditoria-cumplimiento-cliente`): requisitos del bloque tomados del documento del cliente → lentes en tandas pequeñas con checkpoint tras cada una → hallazgos clasificados (corregir en el bloque, diferir al bloque dueño o proponer al PO) → corrección con prueba RED/GREEN y migración nueva solo local → gates (typecheck, lint, unitarias, pgTAP, integración/E2E focales) → reporte del bloque con el formato fijo → **alto hasta la confirmación explícita del PO**.

| Bloque | Plan | Estado de la auditoría |
|---|---|---|
| B0 | `00-fundamentos.md` | Referencia transversal; fuera de la secuencia pedida por el PO (inicia en B1) |
| B1 | `01-sistema-catalogos.md` | **En curso, en pausa** — cola en `B1-hallazgos.md` |
| B2 | `02-clientes.md` | Sin empezar; recibe H-B1-02 (permisos legacy del contador, junto con B3/B4) |
| B3 | `03-rfq.md` | Sin empezar; recibe H-B1-30 y H-B1-45 |
| B4 | `04-propuestas.md` | Sin empezar |
| B5 | `05-orden-trabajo.md` | Sin empezar |
| B6 | `06-produccion.md` | Sin empezar; observación anotada: texto corrupto `devolvi�` en `src/modulos/produccion/componentes/panel-calidad-produccion.tsx:60` |
| B7 | `07-entregas.md` | Sin empezar |
| B8 | `08-finanzas.md` | Sin empezar |
| B9 | `09-estrategia-y-kpis.md` | Sin empezar |

Insumo disponible: la auditoría global previa `entregables/auditoria-global-2026-09-22/` (matriz de 164 requisitos, 41 escenarios, hallazgos) sirve para cruzar cobertura al iniciar cada bloque.

## Entrega parcial H-B1-29 (para Codex)

- **Commit:** `fba32cf` en `auditoria/b1-sistema` (local, sin push). Encargo: `.ai-shared/coordination/ENCARGO_CLAUDE_SII_B1_H29.md`. Modelo real: `claude-opus-5-5`.
- **Archivos nuevos:** `src/nucleo/almacenamiento/archivos/subida-directa.ts`, `subida-navegador.ts` y `esquemas-subida.ts`; `src/modulos/pipeline/subir-adjunto-cliente.ts`; `src/modulos/produccion/acciones/subir-foto-inspeccion.ts`; `tests/integracion/archivos-subida-directa.test.ts`.
- **Archivos modificados:** acciones, esquemas y componentes de RFQ, pipeline (panel de adjuntos y cotizador), propuestas, entregas, documento de orden y calidad de Producción; pruebas unitarias de esquemas de propuestas y entregas.
- **Pruebas:** `pnpm vitest run tests/integracion/archivos-subida-directa.test.ts` contra Supabase local: RED 4 fallas de 10 (contrato `confirmarSubidaDirecta` ausente) → GREEN 10/10. Cubre 2 MiB de extremo a extremo con URL firmada; rechazo de otra entidad, otro usuario y otra extensión; preparar fuera de perfil; objeto inexistente; descartar solo cargas propias no vinculadas; confirmación repetida que conserva el archivo vinculado; limpieza de la carga propia si la vinculación falla. `pnpm test` 966/966, `pnpm typecheck` 0, `pnpm lint` 0.
- **Decisiones:** el servidor emite la ruta `<entidad>/<registro>/<usuario>/<uuid>.<ext>`; `confirmarSubidaDirecta` revalida ruta, no vinculación, extensión, tamaño y MIME del objeto real, vincula y, si algo falla, descarta solo la carga propia de ese registro; descartar exige sesión y propiedad de la ruta. Defecto evitado antes del commit: con `archivos.ruta_storage` único, una confirmación repetida habría disparado el `catch` que borraba el binario ya vinculado. Los documentos de orden pasan a `rfq/<cotización>/…`, prefijo que Producción ya acepta desde `e9da561`. Se conservan permisos, estados y eventos de auditoría de cada flujo, y la semántica de versionado por `nombre_erp` (H-B1-31) queda intacta. En Inspección, el fallo de una foto ya no queda tapado por el mensaje de éxito.
- **Pendiente para cerrar H-B1-29:**
  1. Documentos de cliente: `src/modulos/clientes/acciones/subir-documento-cliente.ts` y `src/modulos/clientes/componentes/ficha-cliente.tsx` (dos llamadas, cerca de las líneas 431 y 558). Conservar el `nombreErp` forzado del reemplazo (SII-B2.6) y el permiso `ver_clientes` o `cliente_documentos`. Es la única Server Action que aún recibe `File`.
  2. E2E > 1 MiB: `tests/e2e/rfq-flujo.spec.ts` (paso 5 con 2 MiB) y E2E de evidencia de entrega y de inspección/Producción, con `E2E_HABILITAR_PRUEBAS_REMOTAS=si`, entorno loopback y puerto 3100.
  3. Gates finales y entrega a Codex.
- **Riesgos:** quedan objetos huérfanos (no vinculados e inaccesibles) si el navegador se cierra entre subir y confirmar; se propone una limpieza programada. `verificarSubidaDirecta` depende de los metadatos `size`/`mimetype` que reporta `storage.list`. El MIME lo declara el navegador al subir y lo acota `allowed_mime_types` del bucket.

## Hipótesis propias pendientes de verificar (B1)

1. `firmarLecturaArchivo` no valida vigencia ni permiso (IDOR depende del llamador) (R-B1-27; diferido a B3 donde vive el llamador RFQ).
2. Versionado de archivos por `nombre_erp`: subir otro archivo con el mismo nombre oculta el anterior (R-B1-31).

## Siguiente paso

0. **Primero, al reanudar tras la tarea de observaciones del cliente:** rebase de requisitos según "Pausa de control" (documento corregido contra `6e3b33c`, R-B1-01..50 y hallazgos afectados).
1. **Terminar H-B1-29** (Claude, mismo encargo): documentos de cliente, E2E > 1 MiB y gates, según "Entrega parcial H-B1-29". Luego entregar a Codex para revisión e integración.
2. ~~RBAC (a y b)~~ hecho en `ac35c5b`. ~~Clasificar H-B1-29..46~~ hecho (fuente: sesión `4c6ad8e4-b953-453d-b80b-86bd0dfd758c`, workflow `wf_be9bc2c3-f72`).
   c. **Siguiente:** catálogos — usar una migración posterior a `20261008000005` (el identificador `20261008000002` quedó reservado pero nunca se creó): columna `actualizado_por` (y `actualizado_en` donde falte) en los 6 catálogos de B1; `privado.registrar_version_catalogo()` toma el actor de `new.actualizado_por`; servicios con CAS por `actualizado_en` esperado (`catalogo_desactualizado`); ~~`ejecutarAccionCatalogo` con `nuevoCorrelationId()`~~ hecho por Codex en `123531e`; historial muestra el nombre del usuario (H-B1-14, H-B1-15, H-B1-22, H-B1-24 parcial). Prueba primero en `supabase/tests/sii_b1_catalogos.test.sql` (hoy afirma actor NULL en líneas 144-148).
3. **Codex:** Actividad H-B1-38/39/40 y archivos H-B1-32/33 ya resueltos. H-B1-31 se apoya en el nuevo `confirmarSubidaDirecta` (un solo punto de vinculación) para no duplicar el flujo. Siguiente independiente: catálogos H-B1-14/15/22/24.
4. Gates (typecheck, lint, unit, pgTAP, integración/E2E focales de B1), simplificación, reporte B1 y alto hasta confirmación del PO. Después, B2 según el "Plan global".
