# Punto de control — Revisión funcional del módulo Órdenes (nota del cliente, 2026-10-13)

> **Estado: EN PAUSA por límite de uso.** Ventana de 5 h al 95 % a las 22:56 (hora local); reinicia **2026-10-14 03:40**; semanal 25 %.
> Sin código modificado · sin ramas nuevas · sin commits · sin migraciones. Fase actual: investigación y plan.
> **No implementar nada hasta que el PO apruebe el plan y autorice la ejecución.**

## 0. Registro de reanudación (2026-10-14, ~06:55)

- La ventana de 5 h se reinició (uso ~8 %; próximo reinicio 11:39). Reanudado por el aviso programado.
- **Instalado y probado en `~/.claude/usage-guard/`:** `guardian.js` (≥80 % aviso · ≥90 % pausa · **≥95 % checkpoint automático sin modelo** · caché de uso 15 s con la ventana alta · tolerancia ±300 s en `resets_at`), `checkpoint.js`, `checkpoint-activo.json` (el mensaje de reanudación llega en `SessionStart`; probado) y `vigia.js` (evento de Monitor al cruzar 88/92/95/98/100 %). Copia del guard anterior: `guardian.js.bak`.
- **Rescatado del corte:** `pistas/` en esta carpeta = archivos que cada agente cortado ya había leído (52–76 por área) y los hallazgos parciales de «actividad-pestanas» (7 pestañas ya con los rótulos del cliente; Actividad separada de Comentarios; faltan eventos de negocio para planificación/cancelación/entrega; Comentarios no tiene sitio en la ficha).
- **Workflow v2** (oleadas de 3 áreas, `effort` medium, presupuesto de ~40 herramientas por agente): `C:\Users\Usuario\.claude\checkpoints\ordenes-revision-cliente-2026-10-13\v2\ordenes-investigacion-v2.js`. Se invoca con `args.hastaOla` = 1, 2, 3; las invocaciones 2 y 3 y la final usan `resumeFromRunId` de la primera (lo ya terminado vuelve del journal). Sin `hastaOla` corre además las fases transversal y de plan. El orquestador mide el uso entre oleadas y no lanza la siguiente con ≥ 70 %.
- **Corrida v2 en curso:** `wf_302166f5-203` (task `wi05zcpnn`), oleada 1 = actividad-pestanas + cola + resumen, lanzada ~06:58 con uso ~8 %. Vigía de uso: Monitor `byze98v7i`. Si se corta: `Workflow({scriptPath: <v2>, resumeFromRunId: "wf_302166f5-203", args: {hastaOla: 1}})` reutiliza lo ya terminado; el journal está en `C:\Users\Usuario\.claude\projects\d--ERP-CC\ab50e759-8577-45ee-8fa3-9b78b22de680\subagents\workflows\wf_302166f5-203\journal.jsonl` y `checkpoint.js` vuelca los transcripts parciales a Markdown.

### Avance 2026-10-14 ~09:00 (uso 73 %)

- **Oleadas 1–3 completas: 9/9 áreas con resultado verificado** (cola, resumen, actividad-pestanas, items-ruta, archivos, entregas-cierre, reactivar-repetir, documento-permisos, historial). Informe legible regenerable sin modelo: `hallazgos/HALLAZGOS-wf_302166f5-203.md` (`node ~/.claude/usage-guard/informe-journal.js <journal.jsonl> <salida.md>`). Datos crudos: `journal.jsonl` de `wf_302166f5-203`.
- Costo real: oleada 1 ≈ 17 %, oleada 2 ≈ 17 %, oleada 3 ≈ 25 % (historial lee 20 requisitos). El endpoint de uso respondió 429 por exceso de consultas (vigía a 45 s + guard); corregido (guard espera ~1 min tras un fallo; vigía a 150 s).
- **Falta (siguiente paso exacto):** fases transversal (impacto, BD/migraciones, pruebas, pre-mortem) + plan en 4 tandas + crítico + plan final. No caben en la ventana actual (~27 %). Tras el reinicio (11:39): `Workflow({scriptPath: <v2>, resumeFromRunId: "wf_302166f5-203"})` **sin** `hastaOla` (las 9 áreas vuelven del journal). Aviso programado a las 11:46 (solo vive con la sesión abierta).
- **Síntesis entregable al PO ya escrita:** `SINTESIS-PROVISIONAL.md` (estado real de R01–R20, hallazgo estructural, propuesta de 4 tandas C8.1–C8.4, decisiones D1–D10). El plan formal de los agentes puede ajustarla.
- Nota de uso del script: `hastaOla` = N corre N oleadas y sigue a las fases finales solo si N ≥ 3; para correr únicamente las 3 oleadas se usa `hastaOla: 2.5`.

## 1. Encargo del PO (2026-10-13)

- Trabajar el módulo **Órdenes** con la «Revisión funcional» del cliente. Ajustar, **no rehacer**. Flujo: RFQ (lo que pide el cliente) → Propuesta (lo que vendemos y estimamos) → Orden (lo aceptado) → Planeación (cuándo y dónde) → Producción (qué ocurrió) → Entrega (qué salió).
- Separar el trabajo en **4 tandas de 5 requisitos** (R01–R20, §2; interpretación mía de «4 puntos de 5 cada uno»).
- Orden pedido por el PO: (1) requerimiento del cliente → (2) investigar cómo está hoy, qué cambia, qué módulos afecta y la mejor forma de implementar sin caer en bucles de error-corrección → (3) plan → (4) el PO aprueba y **autoriza** ejecutar.
- Regla del PO sobre límites: al pasar **95 %** de la ventana de 5 h → punto de control reanudable con todo lo hallado por los agentes; retomar desde ahí cuando el límite se restablezca.
- Texto íntegro de la nota del cliente, glosario, R01–R20, guías por área, esquemas y prompts: en el script del workflow (§5), constantes `NOTA_CLIENTE`, `REQUISITOS`, `AREAS`.

## 2. Requisitos atómicos y agrupación hipotética

| Tanda | ID | Sec. nota | Requisito |
|---|---|---|---|
| A cola y resumen | R01 | 2 | Cola: Folio, Estado, Prioridad, Compromiso, Partidas, Avance; responde «qué necesita atención» y abre la ficha |
| A | R02 | 2 | Cola: una sola acción contextual (p. ej. Liberar); Comentarios, Documento, Cancelar y demás pasan a la ficha (reubicar antes de retirar) |
| A | R03 | 3 | Resumen: ocultar UUID/IDs técnicos |
| A | R04 | 3 | Origen comercial: RFQ, Propuesta y Revisión aceptada con folios humanos y enlaces navegables |
| A | R05 | 4 | «Folio: O-MMYY_XX» en vez de «Folio legacy»; «Legacy» solo para referencia migrada |
| B fechas/ítems/ruta/archivos/actividad | R06 | 5 | Conservar Compromiso comercial vs Fecha operativa (reprogramación con historial, sin tocar la promesa) |
| B | R07 | 6 | Ítems: Procesos sin duplicar → «Láser CO₂ (2 operaciones)» |
| B | R08 | 7 | Ruta/Operaciones estructurada (#, Proceso, Prep. estimada, Operación estimada, Estado); ejecución real = Producción |
| B | R09 | 8 | Archivos vivos con Origen (RFQ/Propuesta Rev X/Orden), Asociado a (ITxx/general) y Tipo (CAD/Plano…), sin duplicar blobs |
| B | R10 | 12 | Actividad = audit log de eventos de negocio (ORDEN_CREADA, ORDEN_PLANIFICADA, ORDEN_LIBERADA, PRODUCCION_INICIADA…), separado de Comentarios |
| C entrega/cierre/acciones ambiguas | R11 | 9 | «Preparar entrega» alineado y entregas parciales permitidas |
| C | R12 | 9 | Cierre administrativo bloqueado hasta 100 % entregado; CxC independiente |
| C | R13 | 9, 14 | Producción completada ≠ Orden cerrada (50/50 producido y 30/50 entregado ⇒ abierta, faltan 20) |
| C | R14 | 10 | Reactivar: retirar/deshabilitar (retrabajo explícito solo a futuro) |
| C | R15 | 10 | Repetir: no revivir la Orden; retirar o convertir en «nueva Orden basada en la anterior» (nuevo folio + referencia al origen) |
| D documento/permisos/aceptación | R16 | 11 | Documento con subtotal, descuento, IVA y total para roles autorizados |
| D | R17 | 11 | Documento/vista Operator sin precios, costo, IVA, margen ni totales (Cliente, Orden, ITxx, descripción, cantidad, material, espesor, procesos, observaciones, archivos) |
| D | R18 | 11 | Restricción económica también en backend (payloads, servicios, RLS/privilegios) |
| D | R19 | 13 | Cada pestaña responde su pregunta (Resumen/Ítems/Ruta/Archivos/Entregas/Actividad/Documento) |
| D | R20 | 15, 16 | Guardarraíles («No agregar todavía») y 12 criterios de aceptación evidenciados |

## 3. Hechos verificados leyendo el código (`main` = `origin/main` 950b7a6; árbol idéntico; `main` local está desactualizado)

- **Cola** (`src/modulos/ordenes/componentes/tabla-ordenes.tsx`, 819 líneas). Acciones por fila hoy: abrir ficha (`abrir-ficha-`, l.576), Liberar (`liberar-orden-`, l.584), Cerrar administrativa (`cerrar-administrativa-`, l.596), Comentarios (l.610, `setOrdenComentarios`), Documento (`DocumentoOrdenBoton`, l.616), Repetir (`repetir-orden-`, l.624), Reactivar (`reactivar-orden-`, l.637), Adjuntos (`adjuntos-orden-`, l.649), Cancelar (`cambiar-estado-cancelada`, l.663). Filtros: chips `chip-estado-*`, bandejas `bandeja-*`.
- **Ficha** (`ficha-orden.tsx`, 581 líneas). Pestañas `ficha-pestana-<id>`; paneles: resumen l.300, partidas l.350, ruta l.386, archivos l.414, entregas l.431 (botón `ficha-preparar-entrega` l.439), actividad l.469, documento l.490. Botones de cabecera: `ficha-liberar` l.250, `ficha-cancelar` l.257, `ficha-cerrar` l.264. **«Folio legacy» en l.303** (muestra `ficha.orden.folio`); l.335 «Orden histórica sin snapshot (OP-######): conserva sus datos legacy»; l.526 «Documento histórico basado en partidas legacy».
- **Tipos** (`tipos/ficha-orden.ts`): `FichaOrden.orden` incluye `id`, `folio`, `folioSii`, `idHistorico`, `referenciaExterna`, `fechaCompromisoComercial`, `fechaOperativa`; `PartidaFicha.procesos: string[]`; `ArchivoFicha.origen: 'revision'|'item'` + `clase`; `EventoFicha{tipo,motivo,actorNombre,detalle}`; `TotalesSnapshot{subtotal,descuento,iva,total}`. La ficha lleva `snapshot` y `totales` → **verificar fuga a roles sin `ver_finanzas`** (R18).
- **Cierre administrativo** (`acciones/cerrar-orden-administrativa.ts`): permiso `orden_cerrar_admin`; errores `transicion_invalida` («Solo se cierra una orden con producción completada») y `orden_no_entregada_completa` («Se requiere el 100 % de las cantidades entregadas»). La regla vive en la RPC (pendiente de leer). Hipótesis: hoy exige **ambas** condiciones.
- **Reactivar** (`acciones/reactivar-orden.ts`, permiso `aprobar_ordenes`, PRD-15): la RPC bloquea con entrega o cobros (`orden_entregada_no_reactivable`). **Repetir** (`acciones/repetir-orden.ts`, permiso `aprobar_ordenes`, comentario «CLI-08» de la matriz vieja): devuelve folio nuevo y guarda `ordenOrigenId` → hipótesis: **ya crea una Orden nueva** con referencia al origen (confirmar en la RPC y en pgTAP `a20_cli08_repetir_trabajo`).
- `servicios/reglas-transicion.ts`: `completada` y `cancelada` son terminales para la transición genérica.
- **Ya hecho antes (C4.3/C5):** cola sin Editar/Procesos/Seleccionar/Ajustar; comentarios por Orden; cancelar solo con `orden_cancelar`; documento exige `ver_finanzas`; rutas exigen `orden_vista`; proyecciones positivas y privilegios por columna; vista «Ver como operador» solo lectura.
- **Migraciones:** última local `20261014110000_tarifario_unico_estacion_grupo.sql` (+ `20261014100000_propuesta_item_en_revision_a.sql`; ambas solo locales hasta que el PO las aplique). Toda migración nueva debe llevar marca posterior.
- **Pruebas que tocan Órdenes:** `tests/unitarias` (21 archivos), `tests/integracion` (3), `tests/e2e` (3), pgTAP en `supabase/tests/` (`sii_b5_orden`, `sii_b7_entregas`, `a20_prd15_reactivar_orden`, `a20_cli08_repetir_trabajo`, `c4_2_orden_comercial_operativa`, `c4_3_confidencialidad_ordenes`, `sii_b1_actividad`, `sii_b1_archivos`, `c3_1_linaje_documental_orden`, `a20_metas_proceso_partida`, `a20_prd09_avance_proceso`, `sii_b9_kpis`).
- **Numeración libre:** CLI-15 (`tasks/plan.md` §3; ojo: «CLI-NN» existe en dos vocabularios, la matriz de 164 de septiembre y `plan.md`), DC-16, corte nuevo en `tasks/todo.md`. El cambio de decisión sobre Reactivar/Repetir debe registrarse en `docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md` (fecha y autor PO).
- **Lecciones aplicables** (`docs/CUELLOS-DE-BOTELLA.md`): reubicar antes de retirar; consultas `.in(ids)` en lotes de 100; `pnpm typecheck` antes de E2E; verificar nombres reales de parámetros de RPC; triggers `SECURITY DEFINER`; fixtures sin fechas fijas; E2E con residuales; CI del `headSha`; rama nueva desde `origin/main` tras cada merge; el PO aplica las migraciones remotas.

## 4. Lo que NO se completó

- Workflow `wf_bdaa53f1-209` (task `w73yedo0f`, 24 agentes planeados) **detenido a 95 %: 0 agentes completados** (6 lectores llevaban ~13 min, 3 en cola). No hay hallazgos estructurados, ni verificación, ni plan.
- Respaldo de los 6 transcripts parciales (9 MB), journal y script: `C:\Users\Usuario\.claude\checkpoints\ordenes-revision-cliente-2026-10-13\`. Extracción sin modelo (archivos leídos, búsquedas, notas, razonamiento, salida estructurada si existió): subcarpeta `salvage\` (`INDEX.md` + un `.md` por agente).
- **Causa del consumo:** 6 agentes en paralelo con esfuerzo heredado «max» y lecturas completas repetidas de los mismos archivos (ficha, cola, servicios) llevaron la ventana de 18 % a 95 % en ~14 min (≈5 %/min). Un run completo equivale a ~3 ventanas. El journal solo conserva agentes **terminados**.

## 5. Reanudar — siguiente paso exacto

1. Pasadas las 03:40: `node C:\Users\Usuario\.claude\usage-guard\probe.js` → `five_hour.used_percentage` debe ser < 40 %.
2. Leer `...\checkpoints\ordenes-revision-cliente-2026-10-13\salvage\INDEX.md` y las notas por agente (lo que ya vieron; no releer lo mismo).
3. **No relanzar el workflow tal cual.** Escribir una **v2** a partir del script guardado `...\checkpoints\ordenes-revision-cliente-2026-10-13\ordenes-revision-cliente-investigacion-wf_bdaa53f1-209.js` con:
   - `effort: 'medium'` en lectores y verificadores (`high` solo plan y crítico);
   - oleadas de **3** agentes (`parallel` de 3, no `pipeline` de 9) y un agente «sonda» entre oleadas que corra `probe.js` y aborte si ≥ 80 %;
   - lectura económica: `Grep` + `Read` con `offset/limit`, sin releer; fusionar áreas que comparten archivos (resumen + items-ruta + archivos + actividad comparten `ficha-orden.tsx` y `ficha-orden-servicio.ts`);
   - agentes cortos: su resultado queda en `journal.jsonl` y es reanudable con `Workflow({scriptPath, resumeFromRunId})`.
4. Con los hallazgos verificados: plan en 4 tandas de 5 (hipótesis A=R01–R05, B=R06–R10, C=R11–R15, D=R16–R20), decisiones para el PO y borrador de registro DC-16 / CLI-15.
5. Presentar al PO. **Solo con su autorización:** ejecutar por tanda (rama desde `origin/main`, RED→GREEN, skill `cerrar-tanda`, un PR por tanda; el PO fusiona y aplica migraciones).

## 6. Decisiones ya identificadas para el PO (confirmar con evidencia)

- **Reactivar:** retirar UI y deshabilitar también en servidor, o dejar latente. PRD-15 fue un pedido anterior del cliente → registrar el reverso.
- **Repetir:** si ya crea una Orden nueva con origen, ¿retirarlo del MVP (como pide el cliente) o moverlo a la ficha como «Nueva orden basada en…»?
- **Cierre:** regla exacta (¿producción completada Y 100 % entregado, o solo 100 % entregado?) y contra qué cantidad (solicitada vs producida).
- **Documento:** hoy exige `ver_finanzas` → falta variante operativa sin precios (hoja de trabajo) para Operator; auditar fuga de `snapshot`/`totales` en la ficha.
- **Estado visible:** etiqueta derivada para «producción completa, entrega pendiente/parcial».

## 7. Mecanismo de límites (instalado en esta sesión)

- `~/.claude/usage-guard/guardian.js`: ≥80 % aviso; ≥90 % orden de pausa al modelo (una vez cada 10 min); **≥95 % checkpoint automático sin modelo** (`checkpoint.js` vuelca journal + transcripts a `~/.claude/checkpoints/auto/...`); caché de uso de 15 s cuando la ventana está alta.
- Puntero `~/.claude/usage-guard/checkpoint-activo.json`: `SessionStart` lo inyecta al abrir una sesión nueva. Borrarlo cuando este frente se cierre.
- Aviso programado (CronCreate, una sola vez, 03:46 local): solo vive mientras la sesión actual siga abierta. Si se cierra, basta abrir sesión nueva: el puntero hace el resto.
- Identificadores: sesión `ab50e759-8577-45ee-8fa3-9b78b22de680` · workflow `wf_bdaa53f1-209` · task `w73yedo0f`.
