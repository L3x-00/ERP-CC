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
| B1 Sistema/Catálogos | 1.1–1.10 | EN_CURSO: E1 verificado (B1.1+B1.2); E3 archivos implementado (pendiente aplicar migración y verificar); E2 catálogos y E4 actividad pendientes | commit E1 | E1: pgTAP 402/402 · integración 223/223 · E2E 40/40 · unit 770/770 · visual 4/4. E3: unit 778/778 · typecheck/lint 0 (sin verificar contra BD todavía) |
| B2 Clientes | 2.1–2.8 | PENDIENTE | — | — |
| B3 RFQ | 3.1–3.9 | PENDIENTE | — | — |
| B4 Propuestas | 4.1–4.9 | PENDIENTE | — | — |
| B5 Orden | 5.1–5.6 | PENDIENTE | — | — |
| B6 Producción | 6.1–6.4 | PENDIENTE | — | — |
| B7 Entregas | 7.1–7.3 | PENDIENTE | — | — |
| B8 Finanzas | 8.1–8.4 | PENDIENTE (diseño) | — | — |
| B9 Estrategia/KPIs | 9.1–9.6 | PENDIENTE | — | — |

Al avanzar, reemplazar `PENDIENTE` por el estado real y enlazar handoff/PR. Este archivo es la única fuente de verdad del avance del plan.

## 8. Próximo paso inmediato

Ejecutar **B0** (ADRs + nomenclatura maestra + patrones) y luego **B1.1/B1.2** (permisos) y **B1.3–B1.7** (catálogos base), que son prerrequisito de RFQ y Propuestas.
