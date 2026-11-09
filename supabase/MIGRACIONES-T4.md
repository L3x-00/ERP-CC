# Migración T4 — el ruteo exige tiempos de operación mayores que cero

**Proyecto Supabase:** `ERP-CC`  
**Fecha:** 09/11/2026

## Archivo

`supabase/migrations/20261107150000_t4_ruteo_horas_mayores_cero.sql`

## Qué cambia

- `editar_ruteo_item` rechaza toda fila cuya **operación (run) sea 0** o cuyo
  **total de horas sea 0**. Si la operación no aporta tiempo, el costo
  calculado también sería 0 y la propuesta se enviaría con un precio falso.
- La **preparación (setup) puede ser 0** cuando el proceso no la requiere; la
  fila completa debe sumar más de 0 horas.
- Se conservan las demás reglas de T3: proceso activo, grupo de equipo activo y
  máquina opcional del mismo grupo.
- La pantalla ya marca el campo en rojo antes de enviar; esta migración cierra
  la puerta también para llamadas directas.

## Estado

- Aplicada y verificada en **local**.
- Pruebas pgTAP: `sii_b4_propuestas.test.sql` (91 aserciones, incluye el caso de
  preparación en 0 válida y el rechazo de operación en 0).
- Remoto: se aplica con `npx supabase db push --linked` después de revisar el
  `--dry-run`.
