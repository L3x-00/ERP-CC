# Continuidad — Auditoría de cumplimiento por bloques (plan SII)

> Punto de control persistente. Se actualiza después de cada paso. Si la sesión se corta
> (límite de uso o cierre), se reanuda desde **Siguiente paso**. El hook
> `~/.claude/usage-guard/guardian.js` (PostToolUse/SessionStart en `.claude/settings.json`)
> ordena registrar aquí el avance cuando el uso de la suscripción llega al 90 %.

## Estado

| Campo | Valor |
|---|---|
| Bloque en curso | **B1 — Sistema** (usuarios/roles, permisos por acción, catálogos, archivos, Actividad) |
| Rama | `auditoria/b1-sistema` (desde `main` en `6e3b33c`) |
| Línea base | `b71d9e0` (cierre del plan) + `6e3b33c` (documento del cliente versionado) |
| Fuente de verdad | `docs/ERP_SII_Handoff_Tecnico_Funcional.md` → decisiones del cliente → plan |
| Proceso | skill `.claude/skills/auditoria-cumplimiento-cliente/SKILL.md` |
| Requisitos B1 | R-B1-01 … R-B1-50 (lista en el workflow de auditoría; se vuelca al reporte) |
| Reglas | Corregir defectos con prueba; migración nueva (nunca editar aplicada) solo en local; commits atómicos locales sin push; fuera de alcance solo se propone; no tocar B2–B9 (se difiere) |

## Historial de pasos

| Fecha/hora | Paso | Resultado |
|---|---|---|
| 2026-10-06 | Commit de cierre `b71d9e0` y documento del cliente `6e3b33c` | Hecho |
| 2026-10-06 | Workflow de 10 lentes `wf_5e9fab30-a60` | **Falló**: límite de sesión (11/11 agentes sin resultado; nada recuperable) |
| 2026-10-07 | Guardián de uso (hook) + rama + este archivo | Hecho |
| 2026-10-07 | Pruebas de B1 (propias) | pgTAP 94/94 (permisos 16, archivos 11, catálogos 40, actividad 27) · unitarias B1 53/53 |
| 2026-10-07 | Revisión git de B1 (propia) | Migraciones B1 nunca editadas tras su commit (1 commit c/u); sin secretos en diffs; commits mezclados: `452bfcf` (B1.10 + B3 ola 1) y `d10ecf5` (catálogos + retrofit en 45 archivos/9 módulos) → hallazgo de proceso, sin reescritura |
| 2026-10-07 | Tanda 1 de lentes (L1 roles/permisos, L2 catálogos) — workflow `wf_797b616a-06e` | Hecho: 27 hallazgos → `B1-hallazgos.md` (10 de B1 a corregir, 13 diferidos, 4 propuestos) |
| 2026-10-07 | Tanda 2 de lentes (L3 archivos, L4 Actividad/UX/alcance) — workflow `wf_be9bc2c3-f72` | En curso (si se corta por límite: `Workflow({scriptPath: <script de wf_797b616a-06e>, resumeFromRunId: "wf_be9bc2c3-f72", args: ["L3","L4"]})` reutiliza lo terminado) |
| 2026-10-07 | Corrección RBAC (H-B1-03/05/06/07/09/13) — commit `ac35c5b`, migración `20261008000001` (solo local) | Hecho: pgTAP 24/24 + 16/16, concurrencia 2/2, unitarias 962/962, typecheck/lint 0. H-B1-02 diferido a B2/B3/B4 (otorgar permisos legacy abriría mutaciones) |
| 2026-10-07 | Guardián probado en sesión real: aviso al 83 % (5 h, reinicia 13:30) | Pausa preventiva: sin lanzar trabajo nuevo hasta el reinicio |
| 2026-10-07 | Tanda 2 terminada (`wf_be9bc2c3-f72`, 2/2 agentes) | 18 hallazgos registrados como H-B1-29..46 "Por clasificar" en `B1-hallazgos.md` (1 Crítico: subidas limitadas a 1 MB). **PAUSA al 89 %** hasta el reinicio de las 13:30 |
| 2026-10-07 | Sesión Claude Code identificada y tanda 2 clasificada por Codex | Sesión `4c6ad8e4-b953-453d-b80b-86bd0dfd758c`, modelo comprobado `claude-opus-5-5`; 7 bloqueantes B1, 6 no bloqueantes B1, 2 diferidos a B3, 2 propuestas PO y H-B1-44 consolidado con H-B1-24. Límite 5 h comprobado en 90 %, reinicio `2026-10-07 13:29:59 -05:00` |

## Hipótesis propias pendientes de verificar (B1)

1. `obtener_actividad` solo etiqueta pipeline/clientes/órdenes (folio viejo) y nunca se actualizó tras B1 → eventos de B4–B8 sin etiqueta legible (R-B1-34/38).
2. Acciones de permisos/usuarios no pasan `correlationId` a `registrarLog` (R-B1-35).
3. Carrera en guarda de último admin (`cambiar_rol_usuario`/`cambiar_estado_usuario` bloquean solo la fila objetivo) (R-B1-09).
4. `actualizar_permisos_rol` sin lock ni CAS (R-B1-41).
5. `firmarLecturaArchivo` no valida vigencia ni permiso (IDOR depende del llamador) (R-B1-27).
6. Versionado de archivos por `nombre_erp`: subir otro archivo con el mismo nombre oculta el anterior (R-B1-31).
7. Matriz inicial: `contador` sin `orden_cerrar_admin` pese a §5 "cierres administrativos" (R-B1-05).

## Siguiente paso

0. ~~Clasificar H-B1-29..46~~ hecho. Fuente completa: sesión Claude Code `4c6ad8e4-b953-453d-b80b-86bd0dfd758c`, tarea `wpyqhfrye`, workflow `wf_be9bc2c3-f72`; resumen persistente en `B1-hallazgos.md`.
1. **Al reanudar Claude tras 13:30:** ejecutar el encargo `.ai-shared/coordination/ENCARGO_CLAUDE_SII_B1_H29.md` en la misma sesión. Primera corrección: H-B1-29, subida directa a Storage mediante URL firmada, con prueba que reproduzca >1 MiB antes de corregir y revalidación server-side del objeto real.
2. ~~RBAC (a y b)~~ hecho en `ac35c5b`.
   c. **Siguiente:** catálogos — migración `20261008000002`: columna `actualizado_por` (y `actualizado_en` donde falte) en los 6 catálogos de B1; `privado.registrar_version_catalogo()` toma el actor de `new.actualizado_por`; servicios con CAS por `actualizado_en` esperado (`catalogo_desactualizado`); `ejecutarAccionCatalogo` con `nuevoCorrelationId()`; historial muestra el nombre del usuario (H-B1-14, H-B1-15, H-B1-22, H-B1-24 parcial). Prueba primero en `supabase/tests/sii_b1_catalogos.test.sql` (hoy afirma actor NULL en líneas 144-148).
   - Para pruebas de integración cargar el entorno local: `supabase status -o env` → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sin imprimir valores).
3. Después de H-B1-29: H-B1-31/32/33; Actividad H-B1-38/39/40; catálogos H-B1-14/15/22/24; luego los B1 opcionales que no amplíen alcance.
4. Gates (typecheck, lint, unit, pgTAP, integración/E2E focales de B1), simplificación, reporte B1 y alto hasta confirmación del PO.
