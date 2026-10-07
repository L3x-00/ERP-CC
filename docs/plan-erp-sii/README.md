# Plan de implementación ERP SII/CC — índice, método y seguimiento

> **Fuente normativa única:** `docs/ERP_SII_Handoff_Tecnico_Funcional.md` (documento del cliente, oct-2026).
> Donde el documento no especifica, se conserva el comportamiento actual y se registra una decisión pendiente del PO; **no se inventan reglas de negocio**.

## 1. Cómo usar este plan

1. Leer **`00-fundamentos.md`** (contexto, ADRs, nomenclatura, patrones y gates). Es obligatorio para cualquier IA/desarrollador antes de tocar código.
2. Leer **solo el bloque** asignado; cada bloque es autocontenido: objetivo, alcance, modelo de datos, migraciones, tareas con ID, pruebas y criterios de aceptación.
3. Ejecutar las tareas en el orden del bloque respetando dependencias. No abrir tareas fuera del bloque asignado sin autorización del PO/Codex.
4. Al cerrar cada sub-bloque: actualizar el estado en la tabla de seguimiento (§7), registrar evidencia en el handoff y correr los gates de §6.

## 2. Bloques y mapeo con el documento del cliente

| Bloque | Archivo | Sección(es) del doc | Go Live | Depende de |
|---|---|---|---|---|
| B0 Fundamentos y arquitectura | `00-fundamentos.md` | 3, 4, 6, 7, 19, 23 | — | — |
| B1 Sistema: usuarios, permisos, catálogos, archivos, auditoría | `01-sistema-catalogos.md` | 5, 15 | 1 | B0 |
| B2 Clientes | `02-clientes.md` | 8 | 1 | B0, B1 |
| B3 RFQ | `03-rfq.md` | 9 | 1 | B1, B2 |
| B4 Propuestas y revisiones | `04-propuestas.md` | 10 | 1 | B1, B3 |
| B5 Orden de trabajo | `05-orden-trabajo.md` | 11 | 2 | B4 |
| B6 Producción básica | `06-produccion.md` | 12 | 3 | B5 |
| B7 Entregas | `07-entregas.md` | 13 | 4 | B5, B6 |
| B8 Finanzas (diseño + fase posterior) | `08-finanzas.md` | 14 | después | B7 |
| B9 Estrategia, UX, KPIs, transferencia | `09-estrategia-y-kpis.md` | 16–18, 20–23 | transversal | B4 en adelante |

Grafo de dependencias:

```
B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8
              │      │      └──────────┘
              └──────┴──────────────→ B9 (KPIs desde B4; cierre en B9)
```

## 3. Convenciones de tareas

- ID: `SII-B<bloque>.<sub>-<nn>` (ej. `SII-B4.3-02`).
- Estados: `PENDIENTE → EN_CURSO → IMPLEMENTADO → VERIFICADO → ACEPTADO` (o `BLOQUEADO` con causa).
- Toda tarea declara: entregable, archivos, migración (si aplica), pruebas, criterio de aceptación y referencia al doc.
- Idioma: español para documentación y UI; nombres de código según convención existente del repo (`camelCase` TS, `snake_case` SQL).

## 4. Reglas de oro de compatibilidad

1. **El documento del cliente manda** sobre la implementación actual. Si el documento es silencioso, se conserva lo actual.
2. Nada de borrado destructivo: historias, folios y archivos se conservan; los cambios de datos existentes se hacen con backfill no destructivo.
3. IDs internos inmutables; folios usados **nunca** se reutilizan, ni al cancelar.
4. Todos los estados cambian por **acciones de negocio** (RPC/servidor), nunca por update directo ni dropdown genérico.
5. Ninguna migración se aplica en remoto desde esta estación de trabajo; el PO las aplica (política vigente del repo).
6. Preservar los `entregables/*` ajenos y el trabajo no confirmado de otros.

## 5. Entregables por bloque

Cada bloque produce: migraciones SQL nuevas (solo locales hasta autorización), tipos regenerados, módulo UI + Server Actions + servicios, pruebas (unitarias, pgTAP, integración, E2E), documentación en `docs/plan-erp-sii/` y evidencia de gates.

## 6. Gates globales (Definition of Done)

| Gate | Comando / evidencia | Obligatorio |
|---|---|---|
| Tipos | `pnpm typecheck` = 0 errores | sí |
| Lint | `pnpm lint` = 0 errores | sí |
| Unitarias | `pnpm test` (todas verdes + nuevas) | sí |
| SQL | `supabase test db` (pgTAP) con pruebas del sub-bloque | sí si hay SQL |
| Integración | `pnpm test:integracion` | sí si toca RPC/acciones |
| Concurrencia | `pnpm test:concurrencia` | sí si hay locks/CAS/idempotencia |
| E2E | `pnpm test:e2e` (spec nuevo del bloque + regresión) | sí |
| Visual | capturas escritorio/móvil claro/oscuro de pantallas nuevas | sí si hay UI |
| Build | `pnpm build` | sí al cerrar bloque |
| Auditoría | eventos registrados con `correlationId` | sí |
| Revisión | `cross-review` de Codex antes de aceptar | sí |

Cada cierre de bloque debe reportar: archivos cambiados, migraciones (aplicadas solo local), comandos y resultados, fallos, riesgos y pendientes.

**Skills de apoyo automatizadas** (fuente canónica `.agents/skills/`, sincronizadas a Claude): `orca-dev-env` (entorno y gates), `orca-testing` (pirámide de pruebas), `orca-e2e` (Playwright + fixtures + evidencia visual), `orca-migrations` (migraciones + pgTAP local).

## 7. Tabla de seguimiento

| Bloque | Sub-bloques | Estado | Commit(s) | Evidencia |
|---|---|---|---|---|
| B0 Fundamentos | 0.1–0.9 | PENDIENTE | — | — |
| B1 Sistema/Catálogos | 1.1–1.10 | **COMPLETADO** (E1–E4 verificados y commiteados) | `7f97714`, `72d1765`, `d10ecf5`, `452bfcf` | pgTAP 611/611 · integración 226/226 · unit 862/862 · E2E (actividad/catálogos) · capturas E2 4/4 |
| B2 Clientes | 2.1–2.8 | **COMPLETADO** (verificado y commiteado) | `b98a56a` | pgTAP 75/75 · concurrencia 10/10 · integración 226/226 · E2E 6/6 · capturas 12/12 |
| B3 RFQ | 3.1–3.9 | **COMPLETADO** (olas 1 y 2 verificadas y commiteadas) | `452bfcf`, `a0cd4f3` | pgTAP 744/744 · integración 226/226 · E2E 46/46 · unit 886/886 |
| B4 Propuestas | 4.1–4.9 | **COMPLETADO** (olas 1 y 2 commiteadas: UI, PDF interno y envío atómico) | `6b0c524`, `5aa3ca9` | pgTAP 912/912 global · E2E propuestas-flujo verde |
| B5 Orden | 5.1–5.6 | **COMPLETADO + auditado 2026-10-07** (ola 1 `7aaee76`, ola 2 `b3740bc`): documento de orden desde snapshot | `7aaee76`, `b3740bc` | pgTAP `sii_b5_orden` + global 1110/1110 · E2E estados/flujo/edición/heredadas 4/4 · unit 960/960 |
| B6 Producción | 6.1–6.4 | **COMPLETADO + auditado 2026-10-07** (olas 1 y 2: modelo + UI de piso/calidad; umbral de horas extra = jornada del turno) | `247fe31`, `78933f0` | pgTAP `sii_b6_produccion` 75/75 · global 1110/1110 · E2E piso/corridas/avance 4/4 |
| B7 Entregas | 7.1–7.3 | **COMPLETADO + auditado 2026-10-07** (ola 1 `b4c4487`, ola 2 `7ce25d2`; folio `NE-O-`/`NE-OI-`, RLS con `entrega_evidencia` y fecha de entrega editable con CAS) | `b4c4487`, `7ce25d2` | pgTAP `sii_b7_entregas` 59/59 · global 1116/1116 · E2E `entregas-flujo` verde · capturas 8/8 |
| B8 Finanzas | 8.1–8.4 | **COMPLETADO + auditado 2026-10-07**: F1–F5 implementadas y verificadas; reverso reactiva la promesa de pago | `4880ce3`…`07c56e1` | pgTAP B8 12/12+22/22+28/28+29/29+27/27 · global 1110/1110 · E2E B8 4/4 + regresiones · capturas 16/16 |
| B9 Estrategia/KPIs | 9.1–9.6 | **COMPLETADO + auditado 2026-10-07**: diccionario §9.3, dashboard por permiso y “aprox.” (D5-A); utilización con jornada del turno | `903d170` | pgTAP `sii_b9_kpis` 19/19 · global 1110/1110 · unit 960/960 · E2E `kpis-dashboard` 1/1 · capturas 2/2 |

**Plan SII/CC completo localmente (B1–B9)** al 2026-10-06: pendientes del PO únicamente el commit/publicación, las migraciones remotas y la aceptación/CI. `supabase db reset` local + fixture sigue recomendado para acelerar suites.

**Decisiones finales del cliente (D1–D5) aplicadas 2026-10-06:** folios derivados con prefijo `NE-O-`/`NE-OI-` (y `RP-` equivalente; migración `20261007230001`), plazo de `credito` por días del cliente con validación (migración `20261007230002`), jornada 8 h ajustable y recordatorios de promesas confirmados, y KPIs aproximados rotulados como estimaciones operativas. Detalle en `decisiones-pendientes-cliente-final.md`.

**Auditoría funcional B5–B9 (2026-10-07):** corregidos 6 defectos con migraciones `20261007230003` (umbral de horas extra = jornada del turno), `20261007230004` (RLS de evidencia de entrega con `entrega_evidencia`), `20261007230005` (el reverso reactiva la promesa de pago), `20261007230006` (utilización KPI con jornada del turno), `20261007230007` (fecha de entrega editable con CAS) y el documento de orden leyendo el snapshot (`documento-orden-servicio.ts`). Evidencia final: pgTAP global **1116/1116** · unit **961/961** · integración **227/227** · typecheck/lint 0 · build OK · E2E por bloque verdes.

**Migraciones pendientes de aplicar en remoto (orden):** `20261007220001` → `20261007230001` → `20261007230002` → `20261007230003` → `20261007230004` → `20261007230005` → `20261007230006` → `20261007230007`.

**Mantenimiento local (opcional):** los e2e/integración dejan usuarios `@orca.local`; si se acumulan operadores con PIN, el escaneo bcrypt del PIN puede exceder el timeout de PostgREST. Neutralizar los residuales antes de correr integración: `UPDATE public.usuarios SET pin_operador = NULL, pin_cambiado_en = now(), activo = false WHERE email LIKE '%@orca.local' AND rol = 'operador' AND pin_operador IS NOT NULL;`

Al avanzar, reemplazar `PENDIENTE` por el estado real y enlazar handoff/PR. Este archivo es la única fuente de verdad del avance del plan.

## 8. Próximo paso inmediato

Con E1/E3 cerrados, el trabajo corre en **modo paralelo** (ver §9): terminal A con E2 catálogos, terminal B con E4 actividad, terminal C con B2 clientes; el coordinador verifica, integra y commitea.

## 9. Desarrollo paralelo (3 terminales + coordinador)

- Protocolo obligatorio: `paralelo/PROTOCOLO-PARALELO.md` (propiedad de archivos, bloqueos de tipos/pruebas, migraciones por banda, reporte).
- Prompts listos para pegar: `paralelo/prompts/PROMPT-TERMINAL-A.md` (E2 catálogos), `PROMPT-TERMINAL-B.md` (E4 actividad), `PROMPT-TERMINAL-C.md` (B2 clientes).
- Estados en vivo (append-only): `paralelo/estado/TERMINAL-A.md`, `TERMINAL-B.md`, `TERMINAL-C.md`, `COORDINADOR.md`.
- Bandas de migración: A `2026100610xxxx` · B `2026100620xxxx` · C `2026100630xxxx`. Las migraciones las aplica el PO; las terminales nunca las aplican ni hacen Git de integración.
