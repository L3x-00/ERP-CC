# Migración T2 — fuente maestra de tarifa y vínculo proceso → grupo

**Proyecto Supabase:** `ERP-CC`  
**Fecha:** 07/11/2026

## Archivo

`supabase/migrations/20261107130000_t2_tarifa_grupo_maestra.sql`

## Qué cambia

- **Fuente maestra:** `grupos_equipo.tarifa_hora` es la única tarifa estándar que
  usa el ruteo. `estacion_tarifa` queda como referencia para copiar su valor y
  ya no participa en el cálculo.
- **Backfill:** los grupos que solo tenían estación vinculada reciben una vez el
  valor vigente de esa estación en `tarifa_hora` (MXN), para conservar su costo
  actual.
- **Resolvedor:** la prioridad queda en máquina → tarifa del grupo → respaldo.
  El origen del respaldo incluye el nombre del grupo que no tiene tarifa.
- **Vínculo de procesos:** nueva función
  `public.asignar_procesos_a_grupo_equipo(grupo, procesos[], actor)` para que el
  alta guiada del grupo asigne los procesos compatibles sin tocar
  `grupo_planeado_id`.

## Estado

- Aplicada y verificada en la base **local**.
- **Pendiente de aplicar en remoto.** No se ejecutó `supabase db push` porque
  requiere autorización explícita del Product Owner.

## Verificación local

```powershell
Get-Content supabase/migrations/20261107130000_t2_tarifa_grupo_maestra.sql -Raw |
  docker exec -i supabase_db_ERP-CC psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Pruebas pgTAP relacionadas:

- `supabase/tests/tarifario_unico_estacion.test.sql` (26 aserciones)
- `supabase/tests/c3_2_tarifas_grupo_recurso.test.sql` (17 aserciones)
- `supabase/tests/c3_3_costeo_ruteo.test.sql` (16 aserciones)

## Notas

- Es aditiva e idempotente.
- El backfill no toca datos operativos; solo la configuración de tarifas de los
  grupos.
- La tarifa de respaldo sigue siendo una excepción de V1, marcada para revisión
  en V2.
