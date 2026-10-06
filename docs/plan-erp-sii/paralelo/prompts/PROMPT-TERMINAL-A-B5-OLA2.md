# Prompt — TERMINAL A · B5 Orden, ola 2 (UI y consumidores de estado)

Trabajas en `D:\ERP-CC` en paralelo con B (B6 ola 2: UI de piso) y C (B7 ola 1: entregas modelo). Lee el protocolo, tu estado y `05-orden-trabajo.md` §5.1–§5.6.

## Contexto

B5 ola 1 (`7aaee76`) trae modelo, snapshot, folios `O-`/`OI-`, RPCs y derivaciones, con **puente temporal** `estado ↔ estado_sii` (que tú mismo endureciste en `d91fdc8`). Ahora toca la UI y migrar consumidores. **No elimines el puente todavía**: producción (B6 ola 2) aún lee `estado`; el retiro se coordina al cierre de B6.

## Migración (banda `2026100712xxxx`, `...0004+`)

- Solo si necesitas recrear RPC compartidas para leer `estado_sii` (p. ej. métricas de órdenes); conserva firmas.
- No retires el puente ni cambies `estado` legacy: déjalo para el cierre coordinado.

## UI (dueño: `src/modulos/ordenes/**`, `src/app/(privado)/ordenes/**`)

- **Cola `/ordenes`**: chips por `estado_sii` (Confirmada, Planificada, Lista, En Producción, Producción Completada, Cerrada, Cancelada), bandejas Activas/Archivo, filtros; acciones de negocio por fila: **Liberar** (LISTA), **Cancelar** (motivo), **Cerrar administrativa** (100 % entregado). **Quita** los botones manuales Iniciar/Pausar/Completar: el estado deriva del avance.
- **Ficha de orden** con encabezado folio (`folio_sii ?? folio`) + chip, acción de negocio arriba y pestañas: Resumen, Ítems/Partidas (ITxx), Ruta/Operaciones, Archivos vivos (snapshot), Entregas, Actividad; documento/OS imprimible **desde el snapshot**.
- **Alta**: desde revisión aceptada (acción existente) y **orden interna** con autorización (`orden_crear_interna`); manual/heredada conserva folio legacy.
- Propagar el filtro por `estado_sii` en los consumidores de tu alcance: tarjetas de Planeación, estado de cuenta de Cobranza, repetir/reactivar órdenes y dashboard (claves JSON intactas).

## Pruebas

- pgTAP: métricas recreadas si aplica; el puente sigue intacto.
- E2E `tests/e2e/ordenes-estados-sii.spec.ts`: crear desde revisión aceptada → programar (PLANIFICADA) → liberar (LISTA) → iniciar sesión (EN PRODUCCION) → completar metas (PRODUCCION COMPLETADA) → entregar y cerrar administrativa; cancelar con motivo; sin botones manuales. Capturas 1440/768 × claro/oscuro.
- Regresión: `ordenes-*`, `planeacion-*`, `cobranza-flujo`, `dashboard-roles`, `comercial-realtime`.

## Errores de olas anteriores — no repetir

1. **Puente de estados**: cualquier cambio en `estado` o `estado_sii` dispara sincronización; en INSERT se deriva el lado implícito (no pises el explícito). Cubre ambos sentidos en pgTAP.
2. **Consecutivos**: `CASE` para folios (nunca `lpad` fijo / `FM00`); prueba 99→100→101.
3. **"Hoy"**: usa `hoyIso()` para calendario; no `toISOString()`.
4. **Specs**: la lista de órdenes puede estar paginada/llena; **filtra por folio** antes de aserciones; scopea botones con `ficha.getByRole(...).first()` si hay duplicados; ante re-render de Realtime, **reintenta** el clic y verifica en el panel/BD.
5. `supabase.ts` con lock y marcadores; migraciones solo PO/coordinador; sin git; pruebas mutantes con `BLOQUEO-PRUEBAS.lock`.
6. Antes de una corrida E2E completa local, pide autorización al PO para `supabase db reset` + fixture (los datos acumulados de ~100 corridas ralentizan la suite).

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (lock) · E2E focal+regresión (lock) · `pnpm build`. Reporta en `estado/TERMINAL-A.md` (§7) y pide al PO aplicar `2026100712*` nuevas.
