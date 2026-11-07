# Migración T3 — grupo de equipo obligatorio en el ruteo

**Proyecto Supabase:** `ERP-CC`  
**Fecha:** 07/11/2026

## Archivo

`supabase/migrations/20261107140000_t3_ruteo_grupo_obligatorio.sql`

## Qué cambia

- `editar_ruteo_item` exige un **Grupo de equipo activo** en cada fila del
  ruteo. Antes aceptaba filas sin grupo; la pantalla ya lo impedía, esta
  migración cierra la puerta también para llamadas directas.
- La máquina opcional debe seguir perteneciendo al mismo grupo.
- No cambia ninguna otra regla de edición del ruteo.

## Estado

- Aplicada y verificada en **local** y en **remoto**.
- `supabase db push --linked --dry-run` responde que la base remota está al día.

## Verificación remota

Se comprobó en el proyecto remoto:

- La columna `propuesta_item_ruteo.tarifa_origen` existe.
- Las funciones `resolver_tarifa_hora`, `tarifa_respaldo_hora` y
  `asignar_procesos_a_grupo_equipo` existen.
- No quedan grupos con estación vinculada y sin tarifa estándar.

Pruebas pgTAP relacionadas:

- `sii_b4_propuestas.test.sql` (89 aserciones, incluye el rechazo sin grupo).
- `tarifario_unico_estacion.test.sql` (26 aserciones).
