# Prompt — TERMINAL B · B6 Producción, ola 2 (UI de piso, checklist y calidad)

Trabajas en `D:\ERP-CC` en paralelo con A (B5 ola 2: UI de órdenes) y C (B7 ola 1: entregas modelo). Lee el protocolo, tu estado y `06-produccion.md` §6.1–§6.4.

## Contexto

B6 ola 1 (`247fe31`) trae corridas, catálogo de pausas con liberación de máquina, verificación de inicio, horas extra, inspecciones y sesiones recreadas con corrida. La Server Action hoy **inyecta una verificación marcada “compatibilidad B6 ola 1”**; en esta ola se captura de verdad en la UI.

## Migración (banda `2026100713xxxx`, `...0003+`)

- Solo si necesitas ajustes de contrato para la UI (p. ej. `configurar_corrida`); conserva firmas y grants.
- **Hook a `estado_sii`**: si A ya aplicó B5 (`estado_sii` existe), activa la derivación LISTA→EN_PRODUCCION en el inicio de sesión (tu migración ya lo contempla con `DO/IF EXISTS`); verifica con A que el puente no se retira hasta que tú confirmes que Producción lee `estado_sii`.

## UI (dueño: `src/modulos/produccion/**`, `src/app/(privado)/produccion/**`, `src/app/(piso)/produccion-piso/**`)

- **Corridas**: crear desde partidas compatibles (misma orden/proceso/grupo), ver ítems y avance, iniciar/completar/cancelar con motivo; sin corrida no hay sesión nueva (legacy genera corrida auto).
- **Checklist de inicio real**: material, espesor, cantidad, revisión/archivo vigente, proceso/equipo, observaciones; obligatorio antes de iniciar (reemplaza la inyección de compatibilidad).
- **Pausas por catálogo** (`DUDA/MATERIAL/FALLA/COMIDA/FIN_JORNADA/OTRA`) con nota cuando aplique; **reclamar recurso liberado** (≥60 min con traza) visible para el supervisor.
- **Horas extra**: panel de autorización (Management/Admin) y consumo en el cierre.
- **Calidad**: registrar inspección de primera pieza (cuando el proceso la exige), referencias 1/3/5 en lotes ≥5, intervalos 10/20 y cierre con tolerancias, cantidades, fotos (`archivos` de `inspeccion_calidad`) y material usado.
- **Fin de jornada**: acción de supervisor y cierre automático al primer ingreso del día; ninguna sesión cruza fecha.

## Pruebas

- pgTAP: contrato de `configurar_corrida` si aplica; hook a `estado_sii` (con y sin columna).
- E2E `tests/e2e/corridas-calidad.spec.ts`: crear corrida → checklist → iniciar (EN PRODUCCION si A ya está) → pausa con catálogo → reclamar recurso >1 h (con reloj simulado o datos) → reanudar → terminar con piezas → inspección de primera pieza y cierre; capturas 1440/768 claro/oscuro.
- Regresión: `produccion-piso`, `produccion-avance-procesos`, `taller-taxonomia`, `ordenes-*`.

## Errores de olas anteriores — no repetir

1. **Puente `estado_sii`**: deriva en INSERT y UPDATE; no pises el lado explícito; cubre 99→100 en folios con `CASE`.
2. **`hoyIso()`** para fechas de jornada/calendario; no `toISOString()` para “hoy”.
3. **Specs**: filtra por folio/testid único antes de aserciones (listas paginadas o con residuos); scopea botones duplicados con `.first()`; ante re-render de Realtime, reintenta y verifica panel/BD (caso taller).
4. **Fixtures de catálogo** no se borran (trigger `catalogo_sin_borrado`): desactiva y borra solo `versiones_catalogo`.
5. Migraciones solo PO/coordinador; `supabase.ts` con lock + marcadores; sin git; pruebas mutantes con lock.
6. Antes de una suite E2E completa, pide al PO `supabase db reset` + fixture (datos acumulados).

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (lock) · E2E focal+regresión (lock) · `pnpm build`. Reporta en `estado/TERMINAL-B.md` (§7) y pide al PO aplicar `2026100713*` nuevas.
