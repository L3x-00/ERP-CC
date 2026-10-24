# Cola de trabajo — observaciones del cliente (orden estricto, una sola cosa activa a la vez)

> **Estado 2026-10-19:** la ejecución de C8, C9 y C10 está cerrada; C10.4 se fusionó en #82. Este archivo conserva el histórico de la cola y el orden de ejecución. Toda corrección futura parte de `origin/main` en rama nueva, con autorización del PO.
>
> Todo fue **investigación y plan** hasta la aprobación del PO; después se ejecutó una tanda a la vez. Nunca agentes simultáneos sin resultado: oleadas de 3 áreas, esfuerzo medio, ~40 herramientas por agente, sonda de uso entre pasos (`node C:\Users\Usuario\.claude\usage-guard\probe.js`). Si un paso no cumple su tope de uso, se espera al reinicio de la ventana de 5 h (el aviso programado o una sesión nueva lo retoma). Regenerar informes sin modelo: `node C:\Users\Usuario\.claude\usage-guard\informe-journal.js <journal.jsonl> <salida.md>`.

| # | Paso | Arranca solo si el uso es | Costo medido / esperado | Estado |
|---|---|---|---|---|
| 1 | **Órdenes — fase final** (transversal + plan + crítico + plan final) | < 55 % | ~27 % | HECHO: plan en ordenes-revision-funcional/PLAN-ORDENES-wf_302166f5-203.md (resumen: PLAN-ORDENES-RESUMEN.md) |
| 2 | **Planeación — oleada 1** (carga-semanal, pantalla, programacion) | < 65 % | ~18 % | HECHA (wf_0fa78410-b68, ~10 %) |
| 3 | **Planeación — oleada 2** (reprogramacion, estados-produccion, alcance-coherencia) | < 65 % | ~18 % | HECHA (mismo run, ~10 %) |
| 4 | **Planeación — fase final** (impacto, BD, pre-mortem, **coherencia con Órdenes**, plan, crítico) | < 55 % | ~25 % | HECHA (wf_0fa78410-b68): PLAN-PLANEACION-wf_0fa78410-b68.md y PLAN-PLANEACION-RESUMEN.md; critica aprobable_con_ajustes |
| 4b | **Finanzas - oleada 1** (rentabilidad-orden, material-tres-niveles, compras) | < 65 % | ~10-18 % | HECHA (wf_2356249e-33a) |
| 4c | **Finanzas - oleada 2** (gastos-fuentes, facturacion-cobranza, tesoreria-coherencia) | < 65 % | ~10-18 % | HECHA (mismo run) |
| 4d | **Finanzas - fase final** (impacto, BD, pre-mortem, coherencia con Ordenes y Planeacion, plan, critico) | < 55 % | ~25 % | HECHA: PLAN-FINANZAS-wf_2356249e-33a.md y PLAN-FINANZAS-RESUMEN.md |
| 5 | **NO presentar planes hasta terminar Finanzas** (instruccion del PO 2026-10-14): presentar juntos los TRES planes coherentes entre si (C8 Ordenes, C9 Planeacion, C10 Finanzas) y esperar aprobacion | - | - | PRESENTADO al PO (2026-10-14 ~18:00); espera aprobacion de tandas y decisiones |
| 6 | Ejecución por tanda (rama desde `origin/main`, RED→GREEN, `cerrar-tanda`) | solo con autorización del PO | — | CERRADO: C8.1–C10.4 ejecutadas; C10.1–C10.4 fusionadas (C10.4 #82, merge `77339e6`); F10 parcial y C9.3 pendiente |

## Cómo se lanza cada paso

- **Paso 1:** `Workflow({scriptPath: "C:\Users\Usuario\.claude\checkpoints\ordenes-revision-cliente-2026-10-13\v2\ordenes-investigacion-v2.js", resumeFromRunId: "wf_302166f5-203"})` **sin** `hastaOla`. Al terminar: regenerar `ordenes-revision-funcional/hallazgos/HALLAZGOS-wf_302166f5-203.md` y presentar.
- **Paso 2:** `Workflow({scriptPath: "C:\Users\Usuario\.claude\checkpoints\planeacion-revision-cliente-2026-10-14\investigacion-planeacion.js", args: {"fase":"olas","olas":[1]}})`. **Anotar el run ID nuevo** en `planeacion-revision-funcional/CONTINUIDAD.md`.
- **Paso 3:** mismo script con `resumeFromRunId: <run ID del paso 2>` y `args: {"fase":"olas","olas":[1,2]}` (la oleada 1 vuelve del journal).
- **Paso 4:** mismo script con `resumeFromRunId: <run ID>` y **sin** args (`fase` por defecto = `todo`). Al terminar: `informe-journal.js` y presentar con la matriz de coherencia.
- Vigía opcional durante un workflow: Monitor `node C:/Users/Usuario/.claude/usage-guard/vigia.js 88 150` (avisa al cruzar 88/92/95/98/100 %; con ≥ 92 % → `TaskStop`). El guard genera solo el checkpoint a ≥ 95 %.

## Dónde está cada cosa

- Órdenes: `ordenes-revision-funcional/` → `CONTINUIDAD.md`, `SINTESIS-PROVISIONAL.md`, `hallazgos/`, `pistas/`.
- Planeación: `planeacion-revision-funcional/` → `REQUERIMIENTO.md` (P01–P20, 4 tandas hipotéticas, puntos de coherencia), `MAPA-MODULO.md` (estático, sin modelo; los lectores lo leen primero).
- Maquinaria reutilizable para el siguiente módulo (Producción, Entregas…): `C:\Users\Usuario\.claude\usage-guard\wf\` (`mapa-modulo.js` → mapa; un `config-<modulo>.part.js` con nota, requisitos y áreas; `armar-workflow.ps1` ensambla y valida el script). Solo se escribe la configuración del módulo nuevo.

## Finanzas (Cobranza, Facturacion, Gastos y rentabilidad, Compras, Tesoreria)
- Requerimiento F01-F20: finanzas-revision-funcional/REQUERIMIENTO.md. Mapas estaticos: finanzas-revision-funcional/mapas/. Config: C:\Users\Usuario\.claude\usage-guard\wf\config-finanzas.part.js. Script armado: C:\Users\Usuario\.claude\checkpoints\finanzas-revision-cliente-2026-10-14\investigacion-finanzas.js
- Oleada 1: Workflow({scriptPath: <script>, args: {"fase":"olas","olas":[1]}}) -> anotar el run ID en finanzas-revision-funcional/CONTINUIDAD.md. Oleada 2: mismo script + resumeFromRunId + args olas [1,2]. Fase final: resumeFromRunId SIN args. Luego informe-journal.js e informe-plan.js --digest.

## Punto de control 2026-10-14 14:46 (uso 97 %)
- Planeacion fase final: run wf_0fa78410-b68. Reanudar con Workflow({scriptPath: C:\Users\Usuario\.claude\checkpoints\planeacion-revision-cliente-2026-10-14\investigacion-planeacion.js, resumeFromRunId: "wf_0fa78410-b68"}) SIN args (corre lo que falta: 3 transversales, plan, critico, plan final; premortem y las 6 areas vuelven del journal). Luego: informe-plan.js <journal> planeacion-revision-funcional/PLAN-PLANEACION-wf_0fa78410-b68.md --digest y guardar el digest como PLAN-PLANEACION-RESUMEN.md (lo leen los agentes de Finanzas).
- Despues Finanzas 4b, 4c, 4d (ver arriba). NO presentar planes hasta terminar Finanzas.
- El guard esta restaurado a umbrales 90/95; el PO autorizo llegar a ~98 % cuando haya margen (modificar temporalmente guardian.js: USAGE_GUARD_UMBRAL 97 y USAGE_GUARD_CHECKPOINT 98, y restaurar despues).

## 2026-10-14 ~18:00 - Los tres planes estan listos
- Orden global (analisis de coherencia): C8.1 > C8.2 > C9.1 > C8.3 > C9.2 > C8.4 > C10.1 > C10.2 > C9.3 > C9.4 > C10.3 > C10.4.
- Sin aprobacion del PO no se ejecuta nada. Con aprobacion: tanda por tanda (rama desde origin/main, RED>GREEN, skill cerrar-tanda). Antes de crear cada migracion: Glob de supabase/migrations y supabase migration list.

## 2026-10-15 - C8.1 «Cola mínima y ficha como destino» EJECUTADA (nivel alcanzado: local; PR abierto, sin fusionar)
- Autorizada por el PO el 2026-10-15 con los defaults del plan (el cliente aún sin responder): O-03 Repetir y O-07 Reactivar retirados sin reemplazo; Comentarios como 8.ª pestaña de la ficha. NO se registró nada en DECISIONES-ACEPTADAS.md (pendiente de autorización del PO en el PR de cierre del corte).
- Rama `feat/ordenes-cola-minima-ficha-destino` (desde origin/main 950b7a6), **PR #63** (8 commits; sin migraciones; no incluye estos docs, las skills nuevas ni tasks/todo.md ni la migración 20261014110000 con el typo local).
- Hecho: extracción de 6 paneles de la ficha; pestaña Comentarios + Adjuntos (idHistorico, aprobar_ordenes) + PREGUNTAS_PESTANA + `?pestana=`; redirect `/ordenes?ordenId={uuid}` → `/ordenes/{id}?pestana=comentarios` tras orden_vista; cola recortada a Abrir + Liberar; Repetir/Reactivar fuera (cola, Planeación con poda de `puedeAdministrar` en 6 archivos, Server Actions, servicios, esquemas); RPC y pgTAP/integración conservados.
- Gates locales: typecheck (con .next borrado) 0; `pnpm build` loopback 0; `pnpm lint` 0; `pnpm test` 191 archivos / 1546 pruebas; E2E loopback: los 7 specs del encargo (8 pruebas) + aceptacion-comercial, actividad y ordenes-flujo-completo en verde (comentarios-notificaciones corrió contra el stack local, no se saltó).
- CI VERDE del head real: run 38748442969, sha 15ac67a (jobs `verificacion` y `e2e-local`: pgTAP, integración, E2E completo, concurrencia).
- **FUSIONADA por el PO el 2026-10-15 14:24 UTC (PR #63, merge 771343b).** `main` local sincronizado y rama local borrada. Siguiente en el orden global: C8.2 (espera la autorización expresa del PO para usar los defaults de O-06, O-11, O-13 y O-14; el cliente no ha respondido).
- Pendiente / decisiones para Codex-PO: (1) merge del PO; (2) DocumentoOrdenBoton y obtenerDocumentoOrdenAccion quedaron sin uso en la UI (no estaba en la ficha borrarlos); (3) la ficha C8.1 lista bajo R19 el test «Folio vs Folio legacy» que pertenece a C8.2 (no se hizo); (4) el botón Adjuntos ahora exige aprobar_ordenes (alineado con sus Server Actions); (5) `ordenes-estados-sii` ahora fija test.setTimeout(300 s).
- Siguiente en el orden global: **C8.2**, solo tras el merge del PO y en rama nueva desde origin/main (bloquea: ninguna respuesta del cliente según LEEME §5).

## 2026-10-15 - C8.2 «Ficha: identidad, origen comercial y actividad sin datos técnicos» EJECUTADA (nivel alcanzado: local; PR abierto, CI verde, sin fusionar)
- Autorización del PO (2026-10-15): «de la forma más viable y recomendable… ajustar, no rehacer» con los defaults O-06, O-11 y O-13 (Fase 1, sin SQL). **O-14 NO se aplicó** (los Totales siguen en el Resumen con ver_finanzas; la ficha manda conservarlos y quitarlos espera al cliente). Nada registrado en DECISIONES-ACEPTADAS.md.
- Rama `fix/ordenes-ficha-folio-origen-sin-ids` (desde origin/main 771343b), **PR #64** (2 commits: 8d801bb servicio+UI+unitarias, 7cb04b8 E2E; sin migraciones). CI VERDE del head real: run 38759354627, sha 7cb04b8 (jobs verificacion y e2e-local). MERGEABLE.
- Hecho: origen comercial por folio para todo rol con orden_vista (lista blanca; enlaces solo con rfq_vista/propuesta_vista); «Folio» y «Referencia migrada» solo con idHistorico; textos neutros sin «legacy»; Actividad en español con «Sistema» y sin claves *_id; «Archivo sin nombre»; ninguna pestaña muestra UUID. R06 solo caracterización.
- Gates locales: typecheck (con .next borrado) 0; pnpm lint 0; pnpm test 196 archivos / 1591 pruebas; pnpm build loopback 0; E2E ordenes-estados-sii completo verde; integración c4-3-confidencialidad-ordenes 3/3; RED previo (17 fallos + 2 módulos) y mutación de no-fuga comprobada.
- **R10 queda PARCIAL (Fase 1):** faltan los eventos planificada / producción iniciada / producción completada / cancelada / entregada (SQL; dependen de O-13). El PO debe firmar la deferencia al cerrar el corte.
- Siguiente en el orden global: C9.1 — **BLOQUEADA** (P-01 unidad de programación y P-02 sobrecapacidad sin respuesta del cliente). Por instrucción del PO NO se arranca ninguna tanda más hasta que el cliente responda. Todo el estado reanudable está en `CHECKPOINT-EJECUCION.md`.

## 2026-10-15 - Respuestas del cliente recibidas; C8.2 fusionada (PR #64); C8.2b EJECUTADA (PR #65, CI verde, sin fusionar)
- El cliente respondió las 39 preguntas (registro en `MAPA-RESPUESTAS-A-PLAN.md`). 25 difieren de los defaults: el plan pasó a **17 tandas** (nuevas: C8.2b, C8.5 eventos O-13, C8.6 nueva orden basada en la anterior O-03 B, C9.0 programar por operación P-01 B, C10.2b factura por entrega F-03 A). Detalle y decisiones D1–D5 del PO en `PLAN-REVISADO-RESPUESTAS-2026-10-15.md`. Las fichas afectadas llevan un aviso que remite a ese documento.
- **C8.2b** (O-06 A, O-11): puntualidad, «atrasadas» y la columna «Compromiso» de la cola ahora usan el compromiso comercial (antes el espejo de la fecha operativa); la cola muestra «Operativa …» debajo si difiere; la ficha dice «Folio anterior» para OP-######. Rama `fix/ordenes-fechas-comercial-folio-anterior`, **PR #65** (1 commit 4f7671c, sin migraciones). CI VERDE del head real: run 38805975551, sha 4f7671c. MERGEABLE.
- Gates locales: typecheck 0; lint 0; pnpm test 198 archivos / 1605 pruebas; build loopback 0; E2E focal verde (ordenes-estados-sii, ordenes-heredadas-reactivacion, ordenes-edicion-borrador y ordenes-flujo-completo con --timeout=300000 en local).
- Pendiente: Dashboard SQL (atrasadas/por vencer) contra el compromiso comercial → migración de C8.4. Siguiente: esperar D1–D5 del PO (C8.3, C8.4, C8.5, C8.6, C9.0, C10.2b dependen de ellas); C10.1 (Finanzas) es independiente.

## 2026-10-15 - D1-D5 aprobadas; C8.2b fusionada (PR #65); C8.3a EJECUTADA (PR #67, CI verde, sin fusionar)
- El PO aprobó D1-D5 con las propuestas del plan revisado: respuestas y defaults en `DECISIONES-ACEPTADAS.md` (PR #66, solo docs).
- **C8.3a** (permiso `orden_ver_totales` O-04, R07 procesos, R08 Ruta en tabla, R18 columnas): rama `feat/ordenes-ficha-ruta-archivos-hoja-trabajo`, **PR #67** (5 commits; 1 migración `20261015090000` que aplica el PO antes o junto al despliegue). CI VERDE del head real: run 38814826917, sha 4f5f87c. C8.3 se partió en C8.3a / C8.3b (Archivos vivos + hoja de trabajo en la ficha) / C8.3c (hoja del operador en Producción).
- Aviso: `orden_vista` para vendedor abre también evidencia de entrega y archivos de la Orden (pgTAP B7 actualizado). Siguiente: C8.3b tras el merge de #67.

## 2026-10-15 - PR #66 y #67 FUSIONADOS; tooling de tandas; C8.3b preparada
- #66 (DECISIONES-ACEPTADAS) y #67 (C8.3a, merge `0bb34fe`) fusionados. Pendiente del PO: aplicar la migración `20261015090000` en remoto + `supabase migration list`.
- Skill `orca-ejecutar-tanda`: scripts `editar.mjs` (edición atómica CRLF-safe), `checkpoint.mjs` (umbral/uso/puntero), `entorno.ps1` (Docker+Supabase loopback), `gates.ps1` (typecheck→lint→test→build[→pgTAP]) y `lecciones.md` (14 errores que costaron re-proceso). `e2e-focal.ps1` ahora parte `-Specs a,b` y acepta `-TimeoutMs`. CUELLOS-DE-BOTELLA §4 con 6 filas nuevas (viajan en el PR de C8.3b).
- **C8.3b**: rama `feat/ordenes-archivos-vivos-hoja-trabajo` creada desde `origin/main`, sin código. Digest completo y paso exacto en CHECKPOINT-EJECUCION §4.

## 2026-10-15 - C8.3b EJECUTADA (PR #68, sin fusionar)
- **C8.3b** (R09 Archivos vivos en tabla + abrir archivo O-05, R17 hoja de trabajo sin precios): rama `feat/ordenes-archivos-vivos-hoja-trabajo`, **PR #68** (2 commits, head `dc0e8f0`; sin migraciones). Gates locales completos verdes (209 archivos / 1703 pruebas, build loopback), E2E `ordenes-estados-sii` 1/1, integración loopback 35/36 (rojo ajeno `operadores-pin-concurrencia`, pasa aislado). CI VERDE del head real: run 38824557004, sha dc0e8f0.
- Decisión a confirmar por el PO: la tabla oculta archivos no vigentes además de los retirados. Siguiente: C8.3c (hoja del operador en Producción con PIN) tras el merge de #68.

## 2026-10-16/17 — C8.3c, C8.4 y C8.5 FUSIONADAS; C9.0 en PR #72 (CI en curso)
- **C8.3c** (#69, merge `e4925d9`, 2026-10-16): hoja de trabajo de piso sin precios para el operador con PIN (O-05 C); sin SQL.
- **C8.4** (#70, merge `bb8bc2d`, 2026-10-17): la entrega exige producción completada; el atraso se mide contra el compromiso comercial; migración `20261017100001` (aplicación remota a confirmar con el PO).
- **C8.5** (#71, merge `a2b5a81`, 2026-10-17): eventos de negocio del ciclo de la orden (O-13); migración `20261017120000` (aplicación remota a confirmar con el PO).
- **C9.0 «Programar por operación» (P-01 B)**: rama `feat/planeacion-c9-0-programar-por-operacion` desde `main == a2b5a81`; commits `f4818d3` (migración `20261017130000` + pgTAP c9_0 25/25 + regresión de 10 suites), `e8fec47` (tipos, servicios, UI, unitarias), `da3ff72` (E2E + CUELLOS). **PR #72** (head `da3ff72`, MERGEABLE); **CI VERDE del head (run 39061391716, jobs verificacion y e2e-local)** — listo para que el PO fusione. Detalle reanudable en `CHECKPOINT-EJECUCION.md` §4.
- El PO aplica `20261017130000` en remoto tras el merge; después arranca **C9.1** (ficha en `fichas-de-tanda/`).

## 2026-10-18 — C10.1 EJECUTADA (PR #78; migraciones solo locales)
- **C10.1 «Costo sin IVA y Compras como fuente»** (F11/F09/F06/F07/F08): rama `feat/finanzas-c10-1-costo-sin-iva-compras-fuente` desde `origin/main == c2f8b422`, commits `f10779b`, `5e7ecbe`, `77c2ef8`, `03f411a` y `b9c0fe1` (docs). Migraciones locales `20261018220000` (F11) y `20261018230000` (F06/F07/F08); el PO las aplica en ese orden **antes del despliegue**.
- Efecto en datos: todo costo de gasto se informa sin IVA (tarjeta, desglose, Dashboard y TI); las cifras históricas bajan y el margen sube. Los E2E que fijaban importes con IVA se actualizaron (`gastos-rentabilidad-ti` 1,160 → 1,000).
- Evidencia local: f11 pgTAP 18/18, f06/f08 36/36, sii_b8_compras 31/31, sii_b8_tesoreria y c6_1 verdes; 227 archivos / 1855 unitarias; build loopback; pgTAP completo 76 archivos / 1728 (tolerado local `b4_folio_desborde_check`); E2E compras + gastos + TI 3/3. CI verde run `39177465745` sobre `b9c0fe1` (`verificacion` + `e2e-local`). Regeneración de tipos descartada por deriva local; contrato aplicado a mano.
- Siguiente tras el merge: **C10.2** (conciliación estimado/comprometido/real + pestaña Costos).

## 2026-10-19 — Demo remota autorizada EJECUTADA (PR #86)

- Proyecto `pwnecbcynnqnvfwmvrnn`: backup de esquema (`orca-remote-backup-schema-*`) y datos (`orca-remote-backup-data-*`) en `.ai-shared/backups/`.
- Truncado de 72 tablas transaccionales preservando 8 usuarios, 5 roles, permisos, configuración, catálogos base, grupos y contadores. `ales@gmail.com` intacto; `ales_2_@hotmail.com` con `Demo2026!`.
- Siembra remota completa: 8 clientes, 10 oportunidades, 13 órdenes, 17 partidas, 3 propuestas, 4 compras, 2 facturas, 6 CxC, 5 cobros, 10 gastos y tesorería con saldos/transferencia/conciliación. `catalogo_procesos` y 4 áreas base restaurados.
- Verificación: `demo-cliente verificar` remoto OK; login y navegación real por `/dashboard`, `/ordenes`, `/planeacion`, `/gastos`, `/facturacion` y `/tesoreria`. **PR #86**; CI en vigilancia.

## 2026-10-19 — Demo local limpia y realista EJECUTADA (PR #85)

- Base local reiniciada desde migraciones y resembrada: 7 usuarios demo (admin/ventas/gerencia/finanzas/3 operadores), 5 roles, 8 clientes, 10 oportunidades, 13 órdenes, 17 partidas, 13 programaciones, 9 sesiones, 3 propuestas con costeo/snapshot, 4 compras, 2 facturas, 6 CxC, 5 cobros, 10 gastos y tesorería con saldos/transferencia/conciliación. Sin usuarios `@orca.local` ni clientes E2E.
- Scripts: `demo-cliente.mjs` adaptado a C6–C10 y nuevo `demo-finanzas-c10.mjs`; credenciales/comandos/rollback en `supabase/semillas/README.md`. Dumps previos en `.ai-shared/backups/`.
- Evidencia: `demo-cliente.mjs verificar` OK; smoke E2E de login + 12 módulos 1/1; conciliación OP-001007/009/011 verificada. **PR #85** con CI verde run `39232496564` sobre `4d2529c`, listo para fusionar. Solo local; remoto intacto.

## 2026-10-19 — UI Planeación EJECUTADA (PR #84; sin migración)

- A petición del PO: filtros, «Programar partida», «Trabajo por liberar» y «Capacidad instalada» colapsables; calendario semanal compacto con 7 columnas y scroll horizontal en anchos menores; panel lateral cerrado deja el calendario a ancho completo.
- Componente `SeccionDesplegable` con animación de 200 ms, `aria-expanded`/`aria-controls`, `inert` al cerrar y respeto a reduced-motion; asa de arrastre explícita.
- Evidencia: typecheck/lint, 231 archivos / 1880 unitarias, build loopback y 6/6 E2E (`planeacion-flujo-colaborativo`, `planeacion-capacidad`, `planeacion-bolsa-acciones`). Sin migración ni cambios de lógica. **PR #84** con CI verde run `39213114658` sobre `ea06ccf`, listo para fusionar.

## 2026-10-19 — C10.4 FUSIONADA (PR #82, merge `77339e6`; sin migración) — FINANZAS C10 CERRADO

- C10.3 fusionada en PR #81 (merge `68d94b9`); migración `20261019150000` aplicada en remoto por el PO.
- **C10.4** «Aceptación de punta a punta, fuentes con trazabilidad, coherencia y registro»: E2E `finanzas-conciliacion-orden.spec.ts` siembra Orden + Propuesta + compra recibida + consumo + gasto directo y lee en UI estimado `$7,800.00`, comprometido `$4,000.00`, real `$5,650.00`, margen estimado `61.0 %`, real `71.8 %` y columna Fuente. Sin migración ni cambio funcional.
- Evidencia C10.4: Vitest focal 19/19, pgTAP focal 99/99 (`f15`, `sii_b8_tesoreria`, `f03`), typecheck/ESLint focales y E2E aceptación 1/1 + tesorería 1/1; CI verde run `39199986179` sobre `9cefb14`. F10 queda **parcial** (ajuste manual diferido) y la coherencia de horas con C9.3 queda pendiente de C9.3.
- **Marcas y reservas:** el plan reservó `20261015100000`, `20261015110000` y `20261015120000` para Finanzas; la ejecución usó `20261018220000`, `20261018230000`, `20261019090000`, `20261019120000` y `20261019150000`, sin colisión. Órdenes reservó `20261015120000`, `20261015130000` y `20261015140000`; Finanzas no las usó. `orden_ver_totales` no cambia el gate de la conciliación: sigue `ver_finanzas`.
- **Cierre:** PR #82 fusionado (merge `77339e6`); CI verde run `39199986179` sobre `9cefb14`. PR #83 (solo docs) refleja la fusión en README/REPORTE/plan; CI verde run `39202000054` sobre `4f08783`, listo para el PO.
- **Límites:** una factura por entrega; flujo por cuenta informativo (no saldo conciliado); reversos visibles sin borrar historial; no se reabre F10 sin decisión del PO.

## 2026-10-19 — C10.3 FUSIONADA (PR #81; migración aplicada en remoto)
- El PO fusionó PR #81 (merge `68d94b9`) y aplicó `20261019150000` en remoto. C10.3 cierra F-12/F-13/F-14/F-15; no hay migraciones pendientes de Finanzas.
- Siguiente: **C10.4** (aceptación punta a punta y registro documental).

## 2026-10-19 — C10.3 EN CIERRE (PR #81; migración solo local)
- C10.2b fusionada en PR #80 (merge `83b9e35`); migración `20261019120000` aplicada en remoto.
- **C10.3** «Facturación/Cobranza, flujo en Tesorería, reversos y guardarraíles»: F-12 bloquea cancelar con cobros aplicados (migración `20261019150000`); F-13 mueve el flujo a Tesorería; F-14 muestra original/reverso y excluye el neto; F-15 pgTAP de guardarraíles.
- Evidencia local: sii_b8_facturacion 41/41, f15 14/14, regresiones A20/tesorería/cobros, Vitest de saldos y E2E cobranza/tesorería/facturación; gates 230/1878, build y pgTAP 78/1819. **PR #81** con CI verde run `39195341121` sobre `f8642ab`.

## 2026-10-18 — C10.2 fusionada; C10.2b EN CIERRE (PR #80; migración solo local)
- C10.2 fusionada en PR #79 (merge `d248521`); migración `20261019090000` aplicada en remoto.
- **C10.2b** «Factura por entrega»: una factura por entrega sobre una sola CxC; `facturas.cuenta_id` autoritativo, puntero de la CxC recalculado al cancelar, `factura_excede_cuenta` y disponible por facturar en la UI.
- Evidencia local: sii_b8_facturacion 38/38, regresiones A20/cobros/tesorería, Vitest de disponible, 229/1871 unitarias, build y pgTAP 77/1802; E2E facturación 2/2. Migración `20261019120000` solo local; **PR #80** con CI verde run `39188094167` sobre `4b83dac`.
- Ficha de trabajo creada en `fichas-de-tanda/C10.2b-factura-por-entrega.md` (no existía).

## 2026-10-18 — C10.2 EN CIERRE (PR #79; migración solo local)
- C10.1 fusionada en PR #78 (merge `578dca2`); rama nueva `feat/finanzas-c10-2-conciliacion-costos-orden` desde `origin/main`.
- **C10.2** «Conciliación por Orden»: RPC `obtener_conciliacion_costos_orden`, tabla por concepto con Estimado/Comprometido/Real/Variación/Fuente, márgenes y avisos; pestaña Costos en la ficha con `ver_finanzas`.
- Respuestas aplicadas: F-01 A (material real = consumo), F-02 (`compras.recibida_en`; PAGADA sin recepción no es real), F-04 (estimado con snapshot y real con AR), F-05 y F-07 B.
- Evidencia local: f03 pgTAP 58/58, regresiones SQL, Vitest nuevo, integración real de `p_orden_id`, E2E gastos 2/2; gates completos 229/1869, build loopback y pgTAP 77/1786. Migración `20261019090000` solo local; **PR #79** con CI verde run `39183144852` sobre `35ff39f`.
- Deuda declarada: el trigger de `propuesta_revision_costos` asume `item_id`; se usa `sii.b4_rpc` en fixtures y no se corrige en esta tanda.


