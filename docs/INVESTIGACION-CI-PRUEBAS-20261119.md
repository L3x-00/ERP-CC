# Investigación: sistema de pruebas y CI/CD de ORCA MFG ERP

**Fecha:** 2026-11-19 · **Objetivo:** determinar el estado real de pruebas unitarias, integración, pgTAP, E2E y cobertura, y explicar por qué el CI tarda 15–22 minutos por cambio.

**Método:** lectura del workflow `.github/workflows/ci.yml`, `package.json`, `vitest.config.ts`, `playwright.config.ts`, inventario de `tests/` y `supabase/tests/`, medición local de la suite unitaria, y análisis de tiempos por paso/job/spec de las corridas reales de GitHub Actions vía `gh api`.

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
| --- | --- |
| ¿Cuántas pruebas hay? | **2 752 unitarias** (330 archivos), **307 de integración** (41), **~2 445 pgTAP** (111 archivos SQL), **73 E2E** (48 specs), **12 de concurrencia** (6). Total ≈ **5 589**. |
| ¿Cuánto tarda el CI? | **15–22 min** de reloj. Mediana de las últimas 20 corridas ≈ **17 min**. Medido paso a paso: 16 m 51 s. |
| ¿Dónde se va el tiempo? | **E2E = 62 %** (10 m 24 s de ejecución real). Verificación (tipos+lint+unitarias) = 16 %. Arranque de Supabase = 2 %. |
| ¿Hay selección inteligente de pruebas? | **Sí, pero inútil en la práctica:** una lista blanca de **6 archivos** hardcodeada. Un PR de solo documentación ejecutó el E2E completo (19–20 min). |
| ¿Hay medición de cobertura? | **No.** No existe `@vitest/coverage-v8`, ni umbrales, ni reporte. "Cobertura" hoy significa "cantidad de pruebas", no porcentaje de código. |
| ¿El problema es el volumen de pruebas? | **No.** El volumen es sano para un ERP de 127 k líneas: la suite es rápida por prueba. El problema es **orquestación**: se ejecuta todo, siempre, en serie, en un solo job dependiente. |
| ¿Se puede bajar a 3–6 min? | **Sí**, sin tocar una sola prueba, con 3 cambios de infraestructura (clasificación por rutas, sharding de E2E y desacople de jobs). |

---

## 2. Inventario actual

| Suite | Runner | Archivos | Pruebas | Tiempo real |
| --- | --- | --- | --- | --- |
| Unitarias | Vitest 4.1.11 (`pool` por defecto: forks) | 330 | 2 752 | **76.4 s** en CI / **288 s** en laptop i5-10300H |
| Integración | Vitest `--no-file-parallelism` | 41 | 307 | **21.8 s** |
| Concurrencia estricta | Vitest `--no-file-parallelism` | 6 | 12 | **3.9 s** |
| pgTAP | `supabase test db` (pg_prove) | 111 SQL | ~2 445 | **10 s** |
| E2E | Playwright 1.62.1, `workers: 1`, `fullyParallel: false` | 48 | 73 | **557.6 s** de pruebas + 66.4 s de arranque/build = **624 s** |

Código bajo prueba: **998 archivos** TypeScript/TSX, **127 731 líneas**.

Detalle de la suite unitaria:
- 114 de 330 archivos declaran `@vitest-environment jsdom` (113 usan Testing Library).
- La creación de entorno domina el costo local: 950 s agregados de "environment" frente a 273 s de aserciones. En CI baja a 73.9 s porque el runner es más rápido y no hay antivirus.
- Reparto por módulo (prefijo del archivo): `rfq` 32, `propuestas` 30, `ordenes` 23, `produccion` 19, `pipeline` 18, `planeacion` 17, `ficha-orden` 15, `clientes` 13, `configuracion` 10, `cobranza` 10, `catalogos` 9, `inventario` 7, resto ≤ 6.

### 2.1 Los 10 specs E2E más caros (medidos en la corrida 44420270287)

| Spec | Tiempo |
| --- | --- |
| `produccion-piso.spec.ts` (7 escenarios) | 67.1 s |
| `operadores-gestion.spec.ts` (1 escenario, ciclo de vida completo) | 46.9 s |
| `propuestas-flujo.spec.ts` | 27.5 s |
| `corridas-calidad.spec.ts` | 26.9 s |
| `rfq-flujo.spec.ts` | 26.7 s |
| `taller-taxonomia.spec.ts` | 21.9 s |
| `comercial-realtime.spec.ts` | 21.5 s |
| `cobranza-flujo.spec.ts` | 20.6 s |
| `entregas-flujo.spec.ts` | 20.2 s |
| `aceptacion-comercial.spec.ts` | 16.7 s |

Los 10 suman **296 s**, el 53 % del E2E. La distribución es razonablemente plana: no hay un único test culpable, por lo que **el paralelismo reparte bien** (a diferencia de si un solo test acaparara el 80 %).

---

## 3. Anatomía del tiempo de CI (corrida real 44420270287, 16 m 51 s)

```
cambios            0 m 02 s
verificacion       2 m 42 s   ├ install 6 s ├ typecheck 28 s ├ lint 30 s ├ unitarias 77 s
   (7 s de cola)
e2e-local         13 m 55 s   ├ setup+install 19 s
                              ├ supabase CLI 2 s
                              ├ precarga de imágenes Docker 73 s
                              ├ supabase start (aplica migraciones) 51 s
                              ├ pgTAP 10 s
                              ├ integración 23 s
                              ├ Chromium 22 s
                              ├ E2E 627 s  ← 75 % del job
                              └ concurrencia 5 s
```

**Conclusión del desglose:** la infraestructura de base de datos cuesta ~2 min; las pruebas de datos (pgTAP + integración + concurrencia) cuestan **36 s**; el E2E cuesta **10.4 min**. Cualquier optimización que no ataque el E2E o su frecuencia tiene techo bajo.

### 3.1 Histórico de reloj de pared (últimas 20 corridas)

| Duración | Casos |
| --- | --- |
| 6–7 min | 4 (fallos tempranos en pgTAP/unitarias) |
| 11–17 min | 8 |
| 18–22 min | 6 |
| Canceladas | 2 |

**40 % de las corridas terminó en rojo.** De los últimos 4 fallos analizados, **3 fueron pgTAP** (`planeacion_c9_3_capacidad_real`, `c20_hora_fin_y_avance_pausa`) y **1 fue un flake de transporte E2E** (`The destination stream closed early`, run 44406324360) que pasó al reintentar el job completo: coste de 19 min para volver a verde.

---

## 4. Diagnóstico: por qué tarda y por qué es "tonto"

### H1. La única optimización existente casi nunca aplica
`cambios` compara los archivos del PR contra un `Set` de **6 rutas de RFQ** (commit `a21329d`). Cualquier otro archivo → `solo_ui=false` → E2E completo.

Evidencia: `44465504117` es un merge a `main`; `44365654032` y `44370198540` son PRs **de solo documentación** y aun así ejecutaron `supabase start`, pgTAP, integración y 73 E2E (19–20 min cada uno).

### H2. El E2E es serial por diseño de configuración, no por necesidad
`playwright.config.ts`: `workers: 1`, `fullyParallel: false`. Los 48 specs **no comparten estado por casualidad**: cada uno crea sus propios datos con `service_role` (85 usos en `propuestas-flujo`, 69 en `entregas-flujo`, etc.). El serialismo existe por dos motivos válidos:
1. Algunos specs mutan catálogos globales (procesos, canales, tarifas, roles) que otros leen.
2. Hay aserciones sobre colas y conteos que toleran residuos "porque la base es la misma".

Esto **no impide el paralelismo a nivel de job**: si cada shard corre en su propio stack de Supabase (contenedor independiente en su propio runner), el aislamiento es total. Es la vía de menor riesgo y mayor ganancia.

### H3. Los jobs están encadenados sin necesidad
`e2e-local` declara `needs: [cambios, verificacion]`, así que el reloj suma 2 m 42 s de verificación **antes** de empezar a descargar imágenes. Los dos pueden correr en paralelo y reportar ambos como checks requeridos.

### H4. No hay selección de unitarias por cambio
Siempre se ejecutan 330 archivos. Vitest 4 ya trae la maquinaria exacta: `--changed <ref>` analiza el grafo de imports y ejecuta solo los tests afectados. Verificado en este repo: con el último commit (solo SQL + docs) responde **"No test files found"** en 9 s.

### H5. La base de datos se paga dos veces por corrida
Imágenes Docker se descargan/etiquetan en cada corrida (73 s) y `supabase start` aplica 100+ migraciones (51 s). No hay caché de `~/.cache/ms-playwright` (22 s) ni de imágenes.

### H6. Persisten flujos que cuestan minutos por azar
Sin `retries` en CI. Un flake de transporte o un `waitForURL` puntual obliga a repetir 10–19 min. En el repo hay ~6 `waitForTimeout` (bajo, bien), pero el flake de Server Actions documentado en `CUELLOS-DE-BOTELLA.md` reapareció en `44406324360`.

### H7. No hay sistema de cobertura
- No existe `@vitest/coverage-v8` ni script `test:coverage`.
- No hay umbrales ni gate.
- No hay reporte por módulo ni histórico.
- `docs/estado-actual.md` reporta "2 957 pruebas unitarias" como si fuera cobertura; no mide qué líneas/ramas se ejercitan.
- Playwright tampoco recoge cobertura de cliente (no hay monocart/istanbul).

Consecuencia: no se puede saber qué módulos están protegidos y cuáles solo tienen "pruebas de humo". Sin esa señal, la selección inteligente se vuelve heurística pura.

### H8. La clasificación está en YAML con `paths-filter` + Node embebido
Se descargan los 48 archivos modificados en formato JSON para clasificarlos con un script `<<'NODE'` dentro del workflow. No es reutilizable localmente (los agentes ya tienen `preflight.ps1` que hace una clasificación parecida pero **desconectada** de la del CI) y es difícil de probar.

---

## 5. Arquitectura propuesta: CI proporcional al cambio

### 5.1 Pieza central: `scripts/ci/clasificar-cambios.mjs`

Un único script (Node, sin dependencias) que recibe la lista de archivos cambiados y emite salidas para el workflow:

```jsonc
{
  "docs_solo": false,
  "nivel": "modulo",            // docs | ui | modulo | transversal | total
  "unitarias": "changed",       // none | changed | completas
  "pgtap": "completo",          // none | focal | completo
  "integracion": "focal",       // none | focal | completa
  "e2e": { "modo": "specs", "specs": ["produccion-piso.spec.ts", "..."] },
  "motivo": "src/modulos/produccion/**"
}
```

Reglas (conservadoras: ante duda → `total`):

| Cambio detectado | Unitarias | pgTAP | Integración | E2E |
| --- | --- | --- | --- | --- |
| Solo `docs/`, `*.md`, `.ai-shared/` | ninguna | ninguna | ninguna | ninguno |
| Solo `tests/e2e/*.spec.ts` | cambiadas | ninguna | ninguna | **solo esos specs** |
| Solo `tests/unitarias/*` | cambiadas | ninguna | ninguna | ninguno |
| Solo `src/modulos/<m>/**` | `--changed` | focal si el mapa lo permite; si no, completo | focal del módulo | specs mapeados + transversales |
| `supabase/migrations/**`, `supabase/tests/**` | cambiadas | **completo** | completa | **completo** |
| `src/compartido/**`, `src/lib/**`, `src/nucleo/**`, `src/app/**`, `package.json`, `next.config.ts`, `tsconfig`, `vitest.config`, `playwright.config` | completas | completo | completa | **completo** |
| > 8 módulos afectados o > 40 archivos | completas | completo | completa | completo |
| Push a `main`, `workflow_dispatch`, etiqueta `ci:full` | completas | completo | completa | completo |

Extra: un job de **nightly** (cron 05:00 UTC) corre la suite completa aunque nadie toque nada, para detectar deriva.

### 5.2 Mapa módulo → specs E2E

Archivo versionado `scripts/ci/mapa-e2e.mjs` (o `.json`):

```js
export const POR_MODULO = {
  rfq: ['rfq-flujo', 'continuidad-folios-rfq', 'aceptacion-comercial'],
  propuestas: ['propuestas-flujo', 'aceptacion-comercial'],
  pipeline: ['aceptacion-comercial', 'clientes-historial'],
  clientes: ['clientes-ficha', 'clientes-contactos', 'clientes-historial', 'archivos-cliente', 'comercial-realtime'],
  ordenes: ['ordenes-flujo-completo', 'ordenes-estados-sii', 'ordenes-edicion-borrador', 'ordenes-heredadas-reactivacion', 'ficha-orden'],
  planeacion: ['planeacion-bolsa-acciones', 'planeacion-capacidad', 'planeacion-flujo-colaborativo'],
  produccion: ['produccion-piso', 'produccion-avance-procesos', 'produccion-c20-flujo', 'corridas-calidad', 'taller-taxonomia'],
  entregas: ['entregas-flujo', 'produccion-piso'],
  cobranza: ['cobranza-flujo', 'cobranza-ficha', 'cobranza-folio-rp', 'cobranza-cobro-multiple', 'cobranza-movimientos-consolidacion', 'cancelacion-financiera'],
  tesoreria: ['tesoreria-flujo'],
  gastos: ['gastos-a19', 'gastos-ocr', 'gastos-rentabilidad', 'gastos-rentabilidad-ti', 'finanzas-conciliacion-orden'],
  compras: ['compras-flujo'],
  inventario: ['materiales-costos-c6-3'],
  dashboard: ['dashboard-roles', 'kpis-dashboard'],
  kpis: ['kpis-dashboard'],
  configuracion: ['configuracion-flujo', 'catalogos-base', 'catalogos-comerciales', 'continuidad-folios-configuracion', 'tipo-cambio-diario'],
  permisos: ['permisos-usuarios-admin', 'operadores-gestion', 'dashboard-roles'],
  autenticacion: ['permisos-usuarios-admin', 'operadores-gestion'],
  comentarios: ['comentarios-notificaciones'],
  cierres: ['finanzas-conciliacion-orden', 'ordenes-estados-sii'],
  facturacion: ['facturacion-retirada', 'cobranza-flujo'],
};

// Siempre se suman cuando hay cambio de UI o de cualquier módulo.
export const TRANSVERSALES = ['tema-global', 'dashboard-roles'];
```

Controles de calidad del mapa (importantes):
1. Una prueba unitaria propia (`tests/unitarias/ci-mapa-e2e.test.ts`) que verifique que **todos** los archivos de `tests/e2e/*.spec.ts` aparecen al menos una vez y que ningún nombre del mapa está huérfano. Así el mapa no se queda obsoleto en silencio.
2. El job imprime en el **resumen del job** (`$GITHUB_STEP_SUMMARY`) qué se ejecutó y qué se omitió, con el motivo. Nada de "verde silencioso".
3. Cualquier archivo no reconocido → `total`.

### 5.3 Unitarias: `--changed` en vez de heurística de prefijos

```bash
# PR: solo lo afectado por el diff contra la base
pnpm exec vitest run tests/unitarias --changed="origin/${{ github.base_ref }}"

# main / nightly / cambios transversales
pnpm test
```

Ventaja frente a "prefijo del módulo": Vitest resuelve el grafo real de imports, así que un cambio en `src/compartido/...` arrastra correctamente a los tests que lo consumen. Ya está verificado que funciona en este repo (9 s cuando no hay tests afectados).

Fallback: si `--changed` devuelve 0 archivos para un cambio que no es de docs, el script fuerza la suite completa (protección contra un grafo roto por un alias nuevo).

### 5.4 E2E: sharding con stack propio (la mayor ganancia)

```yaml
e2e:
  if: needs.clasificar.outputs.e2e != 'ninguno'
  strategy:
    fail-fast: false
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    # ... checkout, pnpm, supabase start (stack aislado por job) ...
    - run: pnpm exec playwright test ${{ needs.clasificar.outputs.e2e_args }} \
             --shard=${{ matrix.shard }}/4
      env:
        E2E_HABILITAR_PRUEBAS_REMOTAS: si
```

- Cada shard tiene **su propio** contenedor de Supabase → equivalencia con la base limpia actual.
- Reparto: usar `--shard` de Playwright (reparte por archivo y por test, equilibrando). Con 557 s de pruebas, 4 shards dan ~140 s de ejecución por shard.
- Reloj esperado: `2 m 20 s (stack) + 1 m 30 s (build+arranque) + 2 m 30 s (pruebas)` ≈ **6–7 min**, y en modo focal (2–4 specs) ≈ **4–5 min**.
- Reintentos: `retries: process.env.CI ? 1 : 0` en `playwright.config.ts` + `--reporter=github,list` y artefactos ya existentes. Un flake deja de costar 19 min.
- Complemento opcional (fase posterior): `workers: 2` **dentro** de un shard cuando el stack es propio, si se verifica que los specs del mismo shard no colisionan. No es necesario para llegar a 6 min.

### 5.5 Desacoplar jobs y paralelizar lo barato

```
clasificar (5 s)
├── verificacion (2 m 40 s)   ← typecheck ∥ lint ∥ unitarias afectadas
├── base-datos    (2 m 30 s)  ← supabase start + pgTAP + integración + concurrencia
└── e2e shards    (6–7 min)   ← solo si el cambio lo amerita
```

- Quitar `needs: verificacion` de `e2e-local`; los tres jobs arrancan juntos y los tres son checks requeridos.
- Dentro de `verificacion`, lanzar `tsc` y `eslint` en segundo plano y esperar ambos (ahorra ~30 s) o moverlos a pasos de un mismo job en paralelo con `&` + `wait`.
- `base-datos` se salta entero si el cambio es UI/documentación.

### 5.6 Cachés y micro-optimizaciones

| Acción | Ahorro estimado |
| --- | --- |
| `actions/cache` de `~/.cache/ms-playwright` con clave por versión de Playwright | ~20 s |
| `docker save/load` de imágenes Supabase en caché (clave por versión del CLI) | ~60 s |
| `actions/cache` de `.next/cache` con clave por lockfile | 10–30 s del build |
| `retries: 1` en E2E | evita reruns completos (medido: 1 de 4 fallos recientes) |
| `--pool=threads` en unitarias (experimento) | 10–25 s; requiere verificar aislamiento |

El repo es **público**, así que los minutos de runner no cuestan dinero: el sharding no tiene penalización económica, solo de concurrencia (límite holgado para 4–6 jobs).

### 5.7 Cobertura: lo que falta

Fase 3 (después de bajar el tiempo, no antes):

1. Añadir `@vitest/coverage-v8` y script `test:cobertura` con `--coverage.include=src/**`.
2. Reportes en tres formatos: `text-summary` para el log, `lcov` para historial, `json-summary` para leer umbrales por módulo.
3. **Umbral global de partida realista**, no ideal: medir primero, congelar el valor (p. ej. `lines: <medido - 1>`), y subirlo por módulo en cada tanda. Bloquear solo regresiones (`thresholds.autoUpdate: false`).
4. `--changed` en PR + cobertura del diff (solo líneas nuevas): es la métrica que evita el "cobertura teatro" y castiga menos al legado.
5. Playwright: no medir cobertura de navegador todavía; el costo (instrumentar el build) supera el beneficio frente a la selección por rutas.
6. Publicar el resumen en el job summary y, opcionalmente, Codecov (gratis en repos públicos).

### 5.8 Observabilidad del CI

- `--reporter=junit` en Vitest y Playwright → artefacto + tabla de tests más lentos.
- Paso que publica duración por job en `$GITHUB_STEP_SUMMARY` y falla el PR si un spec se degrada >2× respecto a la mediana (opcional, fase 4).
- Registrar en el resumen: archivos cambiados, nivel detectado, specs ejecutados/omitidos y motivo.

---

## 6. Impacto esperado

| Tipo de cambio | Hoy | Objetivo |
| --- | --- | --- |
| Solo docs / textos | 16–20 min | **~1 min** (sin E2E; o 0 si se usa `paths-ignore`) |
| Un spec E2E editado | 16–20 min | **~5 min** (solo ese spec + unitarias afectadas) |
| Módulo de UI/lógica (`src/modulos/<m>`) | 16–20 min | **~4–6 min** (specs mapeados + `--changed`) |
| Lógica compartida / `src/app` | 16–20 min | **~7–9 min** (E2E completo en 4 shards) |
| Migración SQL / permisos | 16–20 min | **~9 min** (pgTAP + integración + E2E completo en shards) |
| `main` / nightly | 16–22 min | **~12–14 min** (full, sin límite de tiempo) |

Traducción práctica: de **8–9 corridas de CI por jornada** a **20–25**, con el mismo rigor en `main`.

---

## 7. Plan de implementación por fases

### Fase 0 — 30 min de trabajo, sin riesgo (ganancia ~3 min y menos reruns)
1. `retries: 1` en `playwright.config.ts` para `process.env.CI`.
2. Quitar `needs: verificacion` de `e2e-local`.
3. Cachear Chromium de Playwright.
4. Publicar `$GITHUB_STEP_SUMMARY` con los tiempos de cada paso.

### Fase 1 — medio día (ganancia: deja de correr lo que no aplica)
1. `scripts/ci/clasificar-cambios.mjs` + `scripts/ci/mapa-e2e.mjs`.
2. Reemplazar el bloque `paths-filter` + Node embebido por el script.
3. Unitarias con `--changed` en PR; completas en `main`.
4. Saltar `base-datos` y `e2e` cuando corresponda.
5. Test unitario que valide el mapa (ningún spec huérfano).

### Fase 2 — un día (la ganancia grande de reloj)
1. Matriz de 4 shards con stack Supabase por job.
2. Caché de imágenes Docker de Supabase.
3. Validar 3 corridas reales: tiempos por shard, cero colisiones, mapa correcto.

### Fase 3 — un día (cobertura real)
1. `@vitest/coverage-v8` + umbrales congelados + reporte por módulo.
2. Cobertura del diff en PR.
3. Nightly full (suite completa + cobertura + E2E completo).

### Fase 4 — opcional
1. `workers: 2` intra-shard con verificación de aislamiento.
2. Detección de specs degradados.
3. Revisión de qué specs de ciclo de vida largo (`operadores-gestion` 47 s, `produccion-piso` 67 s) pueden dividirse en escenarios independientes.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| **Falso verde**: un test relevante no se ejecuta | Ante archivo no reconocido → suite completa. Mapa validado por test propio. Nightly full. Resumen explícito de lo omitido. Etiqueta `ci:full` para forzar todo. |
| El mapa módulo→spec se queda obsoleto | Test que falla si aparece un spec sin asignar. |
| `--changed` falla por un alias nuevo mal resuelto | Si devuelve 0 tests con cambios de código → suite completa. |
| Shards con colisiones | Cada shard con su propio stack; nunca compartir base entre jobs. |
| Más coste de mantenimiento | Toda la lógica en un script probado, no en YAML embebido. |
| Pérdida de señal por reintentos | `--reporter` conserva el intento fallido en artefactos; revisar flakes semanalmente. |
| Cambios en `permisos_rol` con efectos laterales en pgTAP ajenos | Ya documentado en `CUELLOS-DE-BOTELLA.md`: pgTAP **completo** cuando se toca SQL (10 s, barato). |

---

## 9. Flujo local recomendado (complemento, no sustituto del CI)

Ya existen las herramientas; el hueco es la selección por cambio:

```powershell
# Diario, mientras se edita
pnpm exec vitest run tests/unitarias --changed=origin/main   # ~10-60 s
powershell -File .agents/skills/orca-ejecutar-tanda/scripts/gates.ps1 -Rapido

# Antes de abrir PR
powershell -File .agents/skills/cerrar-tanda/scripts/e2e-focal.ps1 -Specs produccion-piso,entregas-flujo

# Cierre de bloque
powershell -File .agents/skills/orca-ejecutar-tanda/scripts/gates.ps1 -Pgtap
```

Medición local de referencia: la suite unitaria completa tarda **288 s** en el laptop del PO (4 núcleos físicos / 8 lógicos), 3.8× más que en el runner de CI (76 s). Con `--changed` en un módulo típico baja a 10–30 s, lo que elimina la tentación de saltarse las pruebas.

---

## 10. Anexo: evidencia consultada

- `.github/workflows/ci.yml` (jobs `cambios`, `verificacion`, `e2e-local`).
- `package.json` scripts `test`, `test:integracion`, `test:concurrencia`, `test:e2e`.
- `vitest.config.ts` (sin cobertura, `environment: node` + 114 archivos con jsdom).
- `playwright.config.ts` (`workers: 1`, `fullyParallel: false`, `webServer` con `pnpm build`).
- Corrida **44420270287** (verde, 16 m 51 s): desglose por paso y por spec.
- Corridas **44525406045**, **44465504117**, **44334558061** (rojas por pgTAP), **44406324360** (flake de transporte E2E).
- Corridas **44365654032** y **44370198540** (solo documentación, 19–20 min con E2E completo).
- Commit **a21329d** "ci: optimizar pruebas segun archivos modificados" (origen de la lista blanca de 6 archivos).
- `docs/CUELLOS-DE-BOTELLA.md` §1, §2 y §4 (flakes de CI, aislamiento y proceso).
- `docs/estado-actual.md` §Calidad (inventario declarado: 2 957 unitarias, 307 integración, 111 pgTAP, 73 E2E).
- `.agents/skills/orca-ejecutar-tanda/scripts/gates.ps1`, `.agents/skills/cerrar-tanda/scripts/{preflight,e2e-focal}.ps1`.
