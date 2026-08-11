# Reporte crudo de verificación — Sub-fase 5.1

Fecha de ejecución local: 2026-08-11.

## Base de datos local

```text
npx supabase db push --local --yes
Resultado: Finished supabase db push.
Migración aplicada: 20260812000000_fase_5_ordenes_produccion.sql

npx supabase migration list --local
Resultado: local=remote para 18 migraciones, incluida 20260812000000.

Consulta de folios
primer_folio  = OP-001001
segundo_folio = OP-001002

Consulta de privilegios
autenticado_ejecuta_folio = false
autenticado_usa_secuencia = false
autenticado_lee_ordenes   = true
servicio_ejecuta_folio    = true
autenticado_inserta       = false
anon_lee                  = false
servicio_inserta          = true

RLS: true en ordenes_produccion, partidas_orden_produccion y registros_tiempo_operador.
Políticas: una sola política SELECT TO authenticated por cada tabla.
```

La migración se reejecutó de forma idempotente en el contenedor local después de endurecer el formato de folio y privilegios. No se restableció ni eliminó información local.

## Tipos y validaciones

```text
Tipos Supabase: generados desde Postgres local con UTF-8, sin redirección de PowerShell.
pnpm test
Test Files  16 passed (16)
Tests       123 passed (123)

pnpm typecheck
$ tsc --noEmit
Exit code: 0

eslint dirigido a archivos modificados
Exit code: 0

pnpm build
Compiled successfully
Finished TypeScript
Exit code: 0
```

El build conserva el aviso preexistente de Next.js sobre sustituir la convención `middleware` por `proxy`.

## Revisión de seguridad

`supabase db advisors` sobre la base local no reportó advertencias para las tres tablas, la secuencia ni `generar_folio_orden`. Las advertencias existentes pertenecen a políticas y funciones anteriores de `usuarios`, `logs`, `pipeline`, `cotizacion_lineas` y `actualizar_timestamp`.

## Límite remoto

```text
npx supabase migration list
Error: 403 — la cuenta no tiene privilegios para consultar el proyecto remoto.
```

Por ello se confirmó ausencia de drift **local**, pero no se afirma verificación ni despliegue remoto. La aplicación remota y la generación completa de tipos desde ella quedan pendientes de restaurar ese acceso.
