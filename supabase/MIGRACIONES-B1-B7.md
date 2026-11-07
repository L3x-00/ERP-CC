# Migraciones B1–B7: estado y orden de aplicación

**Proyecto Supabase:** `ERP-CC` (`pwnecbcynnqnvfwmvrnn`, región `ca-central-1`)  
**Fecha:** 07/11/2026

## Estado actual

Las ocho migraciones ya fueron **aplicadas en el entorno remoto** y el historial de migraciones quedó reconciliado. También quedaron **copiadas en este proyecto principal** (`supabase/migrations/`) para consulta y re-aplicación controlada.

Verificación realizada:

- `supabase migration list --linked` muestra las ocho versiones con `local` y `remote` coincidentes.
- El esquema remoto contiene:
  - `registros_consumo_material.motivo` y `sesion_id`.
  - `sesiones_trabajo.minutos_setup`.
  - `recosteo_consumos_material` y `recosteo_consumos_material_detalle`.
  - `revaluar_costo_material_consumido` y `registrar_setup_sesion_operador`.
  - Las funciones y objetos de B1–B6.
- No se cargaron ni modificaron datos operativos; solo se aplicó esquema.

## Orden exacto de las migraciones

1. `20261106120000_b1_reconciliacion_esquema_remoto.sql`
2. `20261106130000_b5_costos_finanzas.sql`
3. `20261106140000_b2_produccion_calidad.sql`
4. `20261106150000_b4_corridas_integradas.sql`
5. `20261106160000_b3_ordenes_entregas.sql`
6. `20261106170000_b6_fechas_realtime_seguridad.sql`
7. `20261106180000_b7_consumo_motivo.sql`
8. `20261106180100_b7_recosteo_setup.sql`

## Si necesitas re-aplicar o verificar

Desde la raíz del proyecto principal:

```bash
supabase link --project-ref pwnecbcynnqnvfwmvrnn
supabase migration list --linked
supabase db push --linked --dry-run
```

`db push` no volverá a aplicar las ocho migraciones porque ya están registradas en remoto. Si el comando muestra alguna pendiente, revisa primero `migration list` antes de continuar.

## Orden de fusión de Pull Requests (aplicado)

1. **#157 — B1** `fix/b1-reconciliacion-supabase`
2. **#158 — B5** `fix/b5-costos-finanzas`
3. **#159 — B2** `fix/b2-produccion-calidad`
4. **#160 — B4** `fix/b4-corridas-integradas`
5. **#161 — B3** `fix/b3-ordenes-entregas`
6. **#162 — B6** `fix/b6-fechas-realtime-seguridad`
7. **#163 — B7** `fix/b7-consumo-recosteo`

Los siete PR quedaron **fusionados en `main`** el 07/11/2026. B3 requirió resolver conflictos con B2/B4 y B7 se actualizó sobre B6 antes de fusionarlo.

## Notas

- B7 contiene merges de B2 y B4 porque consume sus firmas; por eso se fusionó al final.
- Las migraciones ya están aplicadas, así que la fusión de los PR solo alineó el código con el esquema remoto.
- No se debe usar `supabase db reset --linked` ni borrar el historial de migraciones.
- El proyecto principal quedó en `D:\ERP-CC` sobre la rama `main`, sin worktrees adicionales.
