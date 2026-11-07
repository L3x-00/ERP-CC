# Migración T1 — tarifas del ruteo V1

**Proyecto Supabase:** `ERP-CC`  
**Fecha:** 07/11/2026

## Archivo

`supabase/migrations/20261107120000_t1_tarifas_ruteo_v1.sql`

## Qué cambia

- Agrega `propuesta_item_ruteo.tarifa_origen` y rellena los renglones ya costeados.
- Amplía el CHECK del snapshot para aceptar `tarifa_fuente = 'RESPALDO'`.
- Agrega `public.etiqueta_estacion_tarifa(text)` y `public.tarifa_respaldo_hora()`.
- Reemplaza `public.resolver_tarifa_hora(uuid, uuid)` con la prioridad V1:
  máquina → tarifa estándar del grupo → respaldo con advertencia.
- **T2 reemplaza esta prioridad:** la estación deja de competir y la tarifa del
  grupo es la fuente maestra. Ver `MIGRACIONES-T2.md`.
- Reemplaza `public.costear_ruteo_revision(uuid, uuid, uuid)` para congelar
  `tarifa_origen`.

## Estado

- Aplicada y verificada en **local** y en **remoto**.
- `supabase db push --linked --dry-run` responde que la base remota está al día.

## Verificación local

```powershell
Get-Content supabase/migrations/20261107120000_t1_tarifas_ruteo_v1.sql -Raw |
  docker exec -i supabase_db_ERP-CC psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Pruebas pgTAP ejecutadas y en verde:

- `supabase/tests/tarifario_unico_estacion.test.sql` (25 aserciones)
- `supabase/tests/c3_2_tarifas_grupo_recurso.test.sql` (17 aserciones)
- `supabase/tests/c3_3_costeo_ruteo.test.sql` (16 aserciones)

## Notas

- Es aditiva e idempotente.
- No modifica datos operativos: solo esquema, backfill de `tarifa_origen` y
  funciones.
- Si el JSON de Configuración no tiene `costoHoraDefault`, el resolvedor sigue
  bloqueando con `tarifa_no_configurada` (no inventa un respaldo).
