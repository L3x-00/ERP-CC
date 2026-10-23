# LEEME — ejecutar las correcciones del cliente (Órdenes C8 · Planeación C9 · Finanzas C10)

> **Punto de entrada para cualquier IA o persona.** No hace falta leer el sistema ni los planes completos: se lee este archivo y **solo la ficha de la tanda** que toque. **Estado vivo (léelo primero): [`CHECKPOINT-EJECUCION.md`](CHECKPOINT-EJECUCION.md)** — tanda activa, autorizaciones del PO, siguiente paso exacto y cómo reanudar. Resumen a 2026-10-19: **Órdenes C8, Planeación C9 y Finanzas C10 cerrados localmente**; C10.1–C10.3 fusionadas y migraciones aplicadas en remoto; C10.4 (aceptación y registro) fusionada (**PR #82**, merge `77339e6`), sin migración. F10 queda parcial (ajuste manual diferido).

## 1. Qué leer (y qué no)
1. Este archivo.
2. La ficha de la tanda en `fichas-de-tanda/` (índices `_indice-C8.md`, `_indice-C9.md`, `_indice-C10.md`). Trae objetivo, requisitos, **evidencia verificada con archivo:líneas**, archivos a tocar, pasos en orden, pruebas y comandos focales, migraciones, criterios de aceptación y riesgos.
3. `PREGUNTAS-CLIENTE-2026-10-14.md` + `MAPA-RESPUESTAS-A-PLAN.md`: preguntas y respuestas registradas. **Las respuestas mandan sobre los defaults de las fichas**; si una ficha conserva un default superado, aplicar la respuesta y anotarlo.
4. Solo si hace falta contexto: `{ordenes,planeacion,finanzas}-revision-funcional/PLAN-*-RESUMEN.md` (30 KB c/u) y `REQUERIMIENTO.md`. Los `PLAN-*-wf_*.md` (170–230 KB) y `hallazgos/` son archivo, no lectura.

## 2. Orden global (análisis de coherencia entre los tres planes)
`C8.1 → C8.2 → C9.1 → C8.3 → C9.2 → C8.4 → C10.1 → C10.2 → C9.3 → C9.4 → C10.3 → C10.4`
Un PR por tanda; el PO fusiona antes de empezar la siguiente (ramas nuevas desde `origin/main`). Las tandas editan los mismos archivos (`ficha-orden.tsx`, `ficha-orden-servicio.ts`, `tabla-ordenes.tsx`, cadena `puedeAdministrar` de Planeación): **no hay paralelismo seguro**.

## 3. Reglas fijas (no negociables)
- **Ajustar, no rehacer** (MVP del propio cliente). Cambio mínimo, reutilizar lo existente, reubicar **antes** de retirar.
- Convenciones de `CLAUDE.md`: español 100 %, Zod para entradas, `can()` antes de mutar, RLS, nunca `any`, hooks con alias (`useX as usarX`), errores genéricos al usuario.
- **Confidencialidad:** operadores y roles sin `ver_finanzas` nunca reciben precios, costos, márgenes, IVA ni totales en ningún payload (proyecciones por lista blanca; nunca `select('*')` ni spread del `snapshot_json`). Prueba de no-fuga **antes** de abrir cualquier lectura.
- **Migraciones:** solo locales (`supabase migration up --local`), idempotentes, `SECURITY DEFINER` + `search_path=''` en triggers, pgTAP con `SET LOCAL ROLE service_role`, tipos regenerados en **UTF-8** (`| Out-File -Encoding utf8`, nunca `>`). La marca de tiempo se asigna al crear el archivo con Glob de `supabase/migrations` (la última de Finanzas es `20261019150000`, aplicada por el PO). El PO aplica en remoto. Antes de aplicar: `supabase migration list`.
- **Pruebas:** por cada cambio, solo lo editado (`pnpm vitest run <archivos>`) + `pnpm typecheck` + eslint focal; E2E focal con loopback (script de la skill `cerrar-tanda`), `pnpm typecheck` **antes** de cualquier E2E; suite completa solo en CI/cierre. Cada tanda: caracterización verde → RED → GREEN. Fechas relativas en fixtures; PIN aleatorio; limpiar residuales E2E. Toda RPC llamada desde una Server Action lleva una prueba que verifica los **nombres reales de sus parámetros**.
- `.env.local` apunta a **producción**: ninguna prueba mutante lo usa.
- Git: un PR por tanda con la skill `cerrar-tanda`; **nunca mergear**; no `supabase db push/repair`. Si el PO indica que Codex integra, seguir `AGENTS.md`/`ACTIVE_TASKS.md`.
- Leer `docs/CUELLOS-DE-BOTELLA.md` antes de tocar CI o migraciones.

## 4. Cómo ejecutar una tanda (checklist)
1. ¿El PO aprobó la tanda y están registradas las respuestas que la bloquean? (ver cuadro §5). Si no, **detenerse**.
2. `git fetch` y rama nueva desde `origin/main` con el nombre de la ficha. `git status` limpio de cambios propios.
3. Seguir `Pasos en orden` de la ficha (caracterización → RED → GREEN). No explorar el módulo: la evidencia ya trae archivo y línea; releer solo el rango.
4. Gates focales de la ficha + `pnpm typecheck` + eslint focal (+ E2E focal si hay UI).
5. Cierre con la skill `cerrar-tanda` (PR verde). Actualizar `COLA-DE-TRABAJO.md` (estado de la tanda) y marcar los criterios de aceptación del cliente cubiertos.
6. Registrar en `DECISIONES-ACEPTADAS.md` («Refinamientos posteriores», fecha y autor PO) las decisiones aplicadas, **solo con autorización del PO**, en el PR de cierre del corte.

## 5. Qué respuestas del cliente bloquean cada tanda
> **2026-10-15: el cliente respondió las 39 preguntas** (registro en `MAPA-RESPUESTAS-A-PLAN.md`; impacto y tandas revisadas en `PLAN-REVISADO-RESPUESTAS-2026-10-15.md`). La tabla de abajo queda como histórico: **ya no hay bloqueos por respuestas**; sí quedan decisiones del PO (D1–D5 del plan revisado).
| Tanda | Bloquea hasta tener respuesta |
|---|---|
| C8.1 | O-03 (Repetir) |
| C8.3 | O-04 (puestos y permisos), O-05 (hoja del operador) |
| C8.4 | O-01 (cierre con faltante/scrap), O-04 |
| C9.1 / C9.2 | **P-01 (unidad de programación)**, P-02 (sobrecapacidad) |
| C9.3 | P-03 (capacidad real al terminar/pausa) — y aceptación expresa del PO del criterio 7 |
| C10.1 / C10.2 | F-02, F-05 y **F-01 (Material real)** |
| C10.3 | F-03 (factura por entrega parcial; si es «sí» → corte propio antes de C10.3) |
Las demás preguntas son confirmaciones con propuesta; sin respuesta se avisa al PO antes de asumir.

## 6. Qué NO hacer (lista del cliente, «no agregar todavía»)
Órdenes: retrabajo avanzado, repetición automática, reactivación genérica, cierre financiero dentro de la Orden, motor de costos, inventario formal, planeación avanzada, calidad avanzada. Planeación: APS, secuenciación automática, MRP, optimización, multi-planta, dependencias multi-operación. Finanzas: contabilidad fiscal, kardex/inventario nuevo, overhead automático, costeo absorbente, MRP, conciliación bancaria automática, motor de costos por recurso sin tarifas calibradas.

## 7. Herramientas y skills (reducen trabajo repetitivo)
- Skill **`orca-ejecutar-tanda`**: protocolo de este §4 con la ficha como entrada.
- Skill **`orca-revision-modulo`**: para el **siguiente** módulo que envíe el cliente (Producción, Entregas…): mapa estático sin modelo → workflow en oleadas de 3 → plan → fichas, con límites de uso. Scripts y plantillas dentro de la skill (`scripts/`).
- Uso de la suscripción: `node scripts/uso.js` (skill) o `~/.claude/usage-guard/probe.js`; el guard avisa a 80 %, pausa a 90 %, checkpoint automático sin modelo a 95 %.

## 8. Mapa de la carpeta
`COLA-DE-TRABAJO.md` (estado y comandos de la investigación) · `fichas-de-tanda/` · `PREGUNTAS-CLIENTE-2026-10-14.md` y `MAPA-RESPUESTAS-A-PLAN.md` · `ordenes-/planeacion-/finanzas-revision-funcional/` (`REQUERIMIENTO.md`, `PLAN-*-RESUMEN.md`, `PLAN-*-wf_*.md`, `hallazgos/`, `CONTINUIDAD.md`, mapas estáticos).
