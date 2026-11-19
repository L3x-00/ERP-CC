# CI proporcional al cambio

Sistema que decide **qué capas de prueba** se ejecutan para cada cambio, en lugar de
correr todo siempre. Implementa las fases 1, 2 y 3 del plan de
`docs/INVESTIGACION-CI-PRUEBAS-20261119.md`.

## Piezas

| Archivo | Responsabilidad |
| --- | --- |
| `catalogo-pruebas.mjs` | Única fuente de verdad: módulo → specs E2E, rutas de `src/app` → módulo, archivos que invalidan todo. Datos puros + descubrimiento y validación. |
| `clasificar-cambios.mjs` | Convierte una lista de archivos modificados en un plan de pruebas (`nivel`, unitarias, integración, pgTAP, E2E). Es lo que consume `.github/workflows/ci.yml`. |
| `ejecutar-unitarias.mjs` | Ejecuta Vitest en el modo indicado (`completas`, `cambiadas`, `archivos`, `ninguna`) con respaldo automático si `--changed` no encuentra pruebas. Con `--cobertura` mide cobertura (solo en `completas` y `cambiadas`). |
| `resumen-cobertura.mjs` | Agrupa el `coverage-summary.json` por área de producto y publica una tabla en el job summary. |
| `tests/unitarias/ci-catalogo-pruebas.test.ts` | Impide que el catálogo quede obsoleto. |
| `tests/unitarias/ci-clasificar-cambios.test.ts` | Fija el comportamiento del clasificador con casos reales. |
| `tests/unitarias/ci-resumen-cobertura.test.ts` | Fija la agregación de cobertura por área. |

## Niveles

| Nivel | Cuándo | Unitarias | Integración | pgTAP | E2E |
| --- | --- | --- | --- | --- | --- |
| `docs` | Solo `.md`, `docs/`, `content/`, `.ai-shared/` y assets inertes de `public/` (imágenes, fuentes) | — | — | — | — |
| `pruebas` | Solo archivos de `tests/` | las editadas / afectadas | si se editaron | si se editó SQL | los specs editados |
| `modulo` | `src/modulos/<m>/**`, `src/app/(grupo)/<ruta>/**`, `src/estado/uso-tienda-<m>.ts` | afectadas (`--changed`) | completa | — | specs del módulo + transversales |
| `transversal` | `src/compartido/`, `src/nucleo/`, `src/lib/`, `src/estilos/`, `src/components/`, ruta de `src/app` sin dueño | completas | completa | completo | completo |
| `total` | `package.json`, lockfile, configs, `.github/`, `scripts/ci/`, `supabase/migrations|tests|semillas`, tipos generados | completas | completa | completo | completo |

Ante cualquier ruta desconocida se escala a `total`. **Nunca se omite una capa por un archivo que el sistema no entiende.**

## Cómo agregar pruebas nuevas (regla de oro)

1. **Spec E2E nuevo** → añádelo al módulo dueño en `MODULOS_E2E` (o a `E2E_TRANSVERSALES` si afecta a todos los flujos).
2. **Módulo nuevo** en `src/modulos/` → añádelo a `MODULOS_E2E`. Si aún no tiene E2E, a `MODULOS_SIN_E2E` con el motivo.
3. **Ruta nueva** en `src/app/` → añade el segmento a `RUTAS_APP_A_MODULO`.
4. **Prueba unitaria nueva** → no requiere registro: su ubicación (`tests/unitarias/<modulo>-*.test.ts`) y el grafo de imports de Vitest la asignan solas.
5. **Archivo de infraestructura** (fixtures, mocks, servidor E2E) → no requiere registro: ya escala a `total`.

Si olvidas el paso 1 o 2, `clasificar-cambios.mjs` termina con código 2 y un mensaje que
dice exactamente qué registrar. Es intencional: el catálogo no puede degradarse en silencio.

## Uso local

```bash
# ¿Qué ejecutaría el CI para mi cambio actual?
node scripts/ci/clasificar-cambios.mjs

# Solo lo afectado por el diff
node scripts/ci/clasificar-cambios.mjs --base origin/main --json

# Simular un cambio concreto
node scripts/ci/clasificar-cambios.mjs --archivos "src/modulos/gastos/acciones.ts"

# Ejecutar solo las unitarias afectadas
node scripts/ci/ejecutar-unitarias.mjs --modo cambiadas --base origin/main

# Cobertura del diff (solo archivos tocados)
pnpm test:cobertura:cambiados

# Cobertura completa con umbrales (main / nightly)
pnpm test:cobertura
node scripts/ci/resumen-cobertura.mjs
```

## E2E en shards (Fase 2)

- La suite completa se reparte en **4 shards** de Playwright. Cada job levanta **su propio**
  stack de Supabase, así que no hay colisiones entre specs ni estado compartido.
- El modo focal (pocos specs) usa **un solo shard**: partir 3 specs en 4 jobs solo paga
  el arranque del stack.
- La matriz es dinámica: el plan publica `e2e_shard_list` y el job la expande con
  `fromJSON`. Cuando no hay E2E la lista vale `[1]` (GitHub rechaza matrices vacías) pero
  el job se salta por `e2e_modo == 'no'`.
- `fail-fast: false`: un shard rojo no cancela los otros; el job agregado decide.
- Cada shard valida que ejecutó al menos una prueba. Un shard donde todo quedó `skipped`
  es un fallo, no un verde.

## Cobertura (Fase 3)

- `@vitest/coverage-v8` con `include: src/**/*.{ts,tsx}`; se excluyen declaraciones y los
  tipos generados de Supabase.
- Reporteros `text-summary`, `json-summary` y `lcov` en `cobertura/`.
- **Umbrales congelados** (`vitest.config.ts`): solo se exigen con
  `COBERTURA_UMBRAL=estricto`, que el workflow activa cuando corre la suite completa
  (`main`, nightly, cambio transversal o total). Un PR normal mide la cobertura de su diff
  y no se compara contra el umbral global. Línea base del 2026-11-19 (suite completa):
  líneas 46,02 %, sentencias 44,59 %, funciones 46,14 %, ramas 42,12 %. Umbrales
  congelados: 45 / 43 / 45 / 41.
- **Cobertura del diff**: en modo `cambiadas`, Vitest hereda `test.changed` en
  `coverage.changed`, así que el informe se limita a los archivos tocados.
- El resumen por área se publica en el job summary y el informe queda como artefacto.
- **Nightly** (06:00 UTC): el evento `schedule` fuerza `total` y ejecuta suite completa,
  cobertura con umbrales y E2E completo en 4 shards.

## Decisiones de diseño

- **Sin dependencias**: Node puro. El clasificador corre en ~0.2 s y no necesita `pnpm install`.
- **Función pura testeable**: `clasificarCambios()` no toca git ni el filesystem; el CLI es una cáscara fina.
- **Conservador por defecto**: dudar cuesta una suite completa; no dudar cuesta un bug en producción.
- **Una sola fuente de verdad**: el mapa vive en el catálogo, no repartido entre YAML y scripts de agente.
- **Mismo criterio en local y CI**: los agentes pueden usar el clasificador antes de abrir un PR.
- **Borrar o renombrar pruebas no rompe el CI**: las rutas que ya no existen se podan de las listas explícitas (y si no queda ninguna, la capa pasa a "no ejecutar"). El catálogo sigue exigiendo que todo spec registrado exista.
- **El job agregado no confía en `skipped`**: contrasta cada capa omitida contra el plan. Si un `if` se rompe y salta una capa obligatoria, el check final falla.
- **E2E no puede quedar verde sin ejecutar**: se verifica que al menos una prueba haya corrido, además de exigir `E2E_HABILITAR_PRUEBAS_REMOTAS=si`.
