# Prompt — TERMINAL B · B3 RFQ ola 2 (UI, archivos, gate LISTO, consumidores y retiro del puente)

Trabajas en `D:\ERP-CC` en paralelo con A (folios) y C (B4 propuestas ola 1). Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`, tu estado y `docs/plan-erp-sii/03-rfq.md` §3.4, §3.6–§3.9.

## Contexto

Ola 1 (commit `452bfcf`): `estado_rfq`, `rfq_items`/`rfq_item_operaciones`/`rfq_eventos`, RPC de estados/ítems/`validar_rfq_listo`, folio `RFQ-MMYY_XX`, RPC del módulo `src/modulos/rfq/**` y **puente bidireccional** `etapa ↔ estado_rfq`. La UI actual de `/pipeline` sigue leyendo `etapa`.

## Migraciones (sigue en tu banda `2026100710xxxx`, archivos `...0004+`)

Guarda de dependencias al inicio (`contadores_folio_periodico`, `catalogo_procesos.requiere_archivo_tecnico`, `archivos`) con mensaje que indique la migración exacta que falta.

1. **Métricas/consumos SQL**: recrea las RPC de métricas del dashboard/equipo que hoy leen `pipeline.etapa` para que usen `estado_rfq` **conservando firmas y contratos de salida** (mismo formato JSON). No cambies nombres ni claves que consume la app.
2. **Retiro del puente** (`...0005`): cuando TODOS los consumidores de abajo ya lean `estado_rfq`, elimina el trigger/función del puente con `DROP TRIGGER IF EXISTS`/`DROP FUNCTION IF EXISTS` (aditiva). `etapa` se conserva como columna histórica (grandfathering): ningún código nuevo la lee.
3. **Archivos del RFQ**: verifica que las acciones actuales (`agregar-archivo-adjunto` etc.) usan la entidad `rfq`/`rfq_item` sobre `archivos` (E3); si hace falta, migración aditiva para clases por defecto y RLS ya cubierta por `privado.puede_ver_archivo`.

## Consumidores reales de `etapa` a migrar (lista del repo; verifica con grep antes/después)

- `src/modulos/pipeline/acciones/`: `actualizar-etapa.ts` (retírala del flujo UI; deja la acción inutilizada con error de negocio claro), `marcar-ganada.ts` y `marcar-perdida.ts` (no borrar: la sustitución llega con B4/B5; solo dejan de invocarse desde la UI), `crear-prospecto.ts` (nace `NEW`; el folio RFQ ya es por trigger), `retirar-oportunidad.ts`, `actualizar-datos-oportunidad.ts`, `asignar-cliente-oportunidad.ts`, `actualizar-orden-interna.ts`, `actualizar-etiquetas.ts`, `crear-cotizacion.ts`, `cotizacion-servicio.ts`, `reglas-transicion.ts` (nuevo mapa por `estado_rfq`), `esquemas-transicion-etapa.ts`, `esquemas-prospecto.ts`.
- `src/modulos/pipeline/componentes/`: `tablero-kanban.tsx`, `selector-etapa.tsx` (se reemplaza por Acciones de negocio), `controles-pipeline.tsx`, `tarjeta-oportunidad.tsx`, `tabla-oportunidades.tsx`, `editor-cotizacion.tsx`, `gestor-etiquetas.tsx`.
- `src/modulos/pipeline/servicios/`: `resumen-pipeline.ts`, `filtrar-oportunidades.ts`, `calcular-alertas.ts`, `obtener-oportunidades.ts` (y su acción `obtener-oportunidades`).
- `src/modulos/dashboard/`: `componentes/seccion-ventas-pipeline.tsx`, `tipos/dashboard.ts` (etiquetas por estado_rfq; conserva los KPI y claves).
- **Transferencia temporal desde C** (C ya cerró B2): `src/modulos/clientes/servicios/obtener-historial-cliente.ts`, `src/modulos/clientes/componentes/historial-cliente.tsx`, `src/modulos/clientes/tipos/historial.ts` — solo para leer `estado_rfq`; no cambies nada más de clientes.
- `src/modulos/auditoria/utilidades/actividad.ts` (etiqueta de pipeline) y `tests/e2e/comercial-realtime.spec.ts` (si cambian los textos de los contadores del embudo).

## UI (según §3.8)

- **Cola `/rfq`** con `/pipeline` como redirección; filtros por estado (chips), cliente, responsable, próxima acción vencida; vistas Lista y Tablero por `estado_rfq`; conserva deep-link (`?rfq=` además del `?oportunidad=` existente).
- **Ficha** `/rfq?rfq=<id>`: encabezado `folio_rfq ?? folio_op` + chip de estado; acciones de negocio arriba según estado (Marcar listo con panel de faltantes de `validar_rfq_listo`, Poner en espera cliente/técnica, Cerrar, Cancelar); pestañas **Resumen, Ítems, Archivos, Propuestas (placeholder B4), Actividad**.
- **Ítems**: ITxx (bloqueado en READY/CONVERTED), cantidad, material → **espesor dependiente** de `catalogo_espesores`, operaciones desde `catalogo_procesos`, acabado/notas; cancelar ítem (no si tiene documentos) usando tus RPC.
- **Archivos**: generales (entidad `rfq`) y por ítem (`rfq_item`) con clases `CAD/DIBUJO/IMAGEN/ESPECIFICACIONES/OTROS`; consume `src/nucleo/almacenamiento/archivos/**` (congelado, no lo edites).
- **Gate LISTO**: el botón se habilita solo sin faltantes y el servidor revalida (error `rfq_no_listo` con detalle).
- Retira de la UI los cambios de `etapa` y los botones “marcar ganada/perdida”.

## Pruebas

- pgTAP: métricas recreadas (mismas claves), puente retirado (no existe trigger), RLS de archivos RFQ ya cubierta.
- Unitarias: mapas `etapa↔estado_rfq` (utilidades existentes), filtros/alertas/resumen, validación de ítems.
- E2E `tests/e2e/rfq-flujo.spec.ts`: crear RFQ desde UI → capturar ítem con material/espesor y operaciones → subir archivo → intentar LISTO y ver faltantes → completar y marcar listo → cancelar un ítem y comprobar que el siguiente ITxx no lo reutiliza; capturas 1440/768 × claro/oscuro en `.ai-shared/qa/sii-b3-ola2/visual/`.
- Regresión: `comercial-realtime`, `aceptacion-comercial`, `dashboard-roles`, `clientes-historial`, `actividad`.

## Errores de la ola anterior que NO debes repetir

1. **Dependencias**: guarda `to_regclass` al inicio de cada migración nueva (B3 falló en remoto por aplicarse antes de A `0610*`).
2. **`supabase.ts`**: lock + verificar marcadores de **todos** los streams; reporta si falta el ajeno.
3. **Ediciones masivas**: `pnpm typecheck` inmediato tras cada lote (una línea mal insertada rompió 9 errores).
4. **Textos/testids**: al cambiar etiquetas/contadores, grep en `tests/` y actualiza los specs (el caso `Quitar contacto`→`Desactivar contacto` rompió la suite combinada).
5. **Migraciones**: solo PO/coordinador; sin git.
6. **Pruebas mutantes**: con `BLOQUEO-PRUEBAS.lock`; no toques módulos de A (`catalogos`, folios) ni de C (`propuestas`); edita los 3 archivos de clientes transferidos solo para `estado_rfq`.

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (con lock) · E2E focal + regresión (con lock) · `pnpm build`. Reporta en `estado/TERMINAL-B.md` (§7) y pide al PO aplicar `2026100710*` (los 0004+).
