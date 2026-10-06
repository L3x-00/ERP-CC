# Prompt — TERMINAL B · B6 Producción básica, ola 1 (modelo y reglas de piso)

Trabajas en `D:\ERP-CC` en paralelo con A (B5 orden ola 1) y C (B4 propuestas ola 2). Lee el protocolo, tu estado y `docs/plan-erp-sii/06-produccion.md` §6.1–§6.3.

## Contexto y encuadre de la dependencia

El plan dice “B6 depende de B5”; A está construyendo B5 (estados/orden desde revisión) en paralelo. Esta ola **modela corridas, pausas, verificaciones, horas extra y calidad sobre las tablas actuales** (`ordenes_produccion`, `partidas_orden_produccion`, `sesiones_trabajo`, `catalogo_procesos`), que ya existen y no cambian. Regla de oro de esta ola: **no asumir `estado_sii`** (B5 puede no estar aplicado): cualquier trigger que lo use va envuelto en `DO $$ ... IF EXISTS(column) ... $$`. La UI/E2E y la integración con estados de orden quedan para la ola 2.

## Migración (banda propia `2026100713xxxx`)

Guarda `to_regclass` de dependencias (`sesiones_trabajo`, `partidas_orden_produccion`, `catalogo_procesos` con sus flags de primera pieza/lote creados por A) con mensaje de orden.

`...0001_sii_b6_produccion_base.sql`:

- `corridas` (orden_id, `codigo` único por orden con prefijo del proceso `LAS01/DOB01/...`, proceso_id, estado `PLANIFICADA|EN_PROCESO|PAUSADA|COMPLETADA|CANCELADA`, cantidad_planificada, `corrida_origen_id`, timestamps) y `corrida_items` (corrida_id, partida_id, `codigo_item` ITxx, cantidad; único corrida+partida).
- `sesiones_trabajo.corrida_id` (FK); los registros nuevos exigen corrida (las órdenes legacy generan corrida automática al primer inicio, sin romper datos).
- `catalogo_motivos_pausa` + seeds `DUDA, MATERIAL, FALLA, COMIDA, FIN_JORNADA, OTRA` con `activo`, `requiere_nota`, `libera_maquina` (DUDA/MATERIAL en `true`); `sesiones_trabajo.motivo_pausa_codigo` (+ nota), `recurso_liberado`, `verificacion_inicio jsonb`.
- `autorizaciones_hora_extra` (orden_id, sesion_id?, horas, motivo, autorizado_por, estado).
- `inspecciones_calidad` (orden/corrida/partida/codigo_item, tipo `PRIMERA_PIEZA|REFERENCIA_LOTE|CIERRE`, referencia, resultado, tolerancias jsonb, cantidades ok/nok/retrabajo, material_usado jsonb, liberado_por).
- RLS de lectura por permiso (`gestionar_produccion`/`produccion_operar`/`calidad_*`), `GRANT ALL` service_role, Realtime de `corridas`.

`...0002_sii_b6_produccion_acciones.sql`:

- `crear_corrida(orden_id, proceso_id, items[], actor)`: compatibilidad (misma orden + mismo proceso + mismo grupo de equipo), folio `<PREFIJO><NN>` con lock de orden; nunca agrupa órdenes distintas.
- `iniciar_corrida`/`completar_corrida`/`cancelar_corrida` (motivo): estados por acción.
- Checklist de eventos críticos en el inicio (material, espesor, cantidad, revisión/archivo vigente, proceso/equipo, observaciones) obligatorio en `verificacion_inicio`.
- `reclamar_recurso_liberado(recurso_id, actor)`: libera si hay sesión pausada ≥ 60 min con motivo `libera_maquina`.
- `cerrar_jornada(fecha, actor)`: cierra sesiones activas con `FIN_JORNADA`; ninguna sesión cruza de fecha.
- `autorizar_horas_extra` y validación en el cierre cuando se excede la jornada configurada del turno (**sin hardcodear 8 h**).
- `registrar_inspeccion`: gate de primera pieza por `catalogo_procesos.requiere_primera_pieza`, referencias 1/3/5 para ≥5 y `intervalo_inspeccion_lote` (10/20) para lotes grandes.
- Recrea `cerrar_sesion_trabajo_operador`/`iniciar_sesion_trabajo_operador` (dueño: tú) integrando corrida, checklist, pausa por catálogo y autorización de extra; `DO $$` para el hook opcional a `estado_sii`.

## Código (dueño: `src/modulos/produccion/**`, sin UI)

Tipos, servicios y acciones servidor con `can()` + admin + `registrarLog` + `nuevoCorrelationId()`. `supabase.ts` con lock; marcadores nuevos: `corridas:`, `catalogo_motivos_pausa:`, `registrar_inspeccion:`, `autorizaciones_hora_extra:`.

## Pruebas

- pgTAP `sii_b6_produccion.test.sql`: compatibilidad de corridas; código por proceso; primera pieza bloquea/desbloquea; referencias de lote; pausa con catálogo; liberación >1 h con traza; cierre de jornada; horas extra sin autorización fallan; RLS/privilegios; el hook a `estado_sii` no rompe cuando la columna no existe.
- Unitarias: helpers puros (prefijo de corrida, referencias de inspección, validación de checklist).
- Integración/E2E: **no** en esta ola (van en la ola 2 sobre B5).

## Errores de la ola anterior que NO debes repetir

1. **Orden de dependencias**: guardas `to_regclass`/columna; no asumas migraciones de A (`estado_sii`) ni de C.
2. **Formato numérico**: usa `CASE` para consecutivos (nunca `lpad` fijo ni `to_char 'FM00'`); prueba 99→100→101 donde aplique.
3. **"Hoy"**: usa `hoyIso()`/fechas locales en lógica de calendario; no `toISOString()` para “hoy”.
4. **Migraciones**: solo PO/coordinador; sin git; `supabase.ts` con lock + marcadores de los 4 streams.
5. **Typecheck inmediato** tras lotes; grep de etiquetas si tocas UI (no en esta ola).
6. **Pruebas mutantes** con `BLOQUEO-PRUEBAS.lock`; no toques módulos de A/C (`ordenes`, `propuestas`, `configuracion`).

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm build` (integración/E2E si el modelo no muta flujos existentes). Reporta en `estado/TERMINAL-B.md` (§7) y pide al PO aplicar `2026100713*`.
