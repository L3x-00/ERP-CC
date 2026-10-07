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
| 2026-10-07 | Tanda 2 de lentes (L3 archivos, L4 Actividad/UX/alcance) — workflow `wf_be9bc2c3-f72` | En curso |

## Hipótesis propias pendientes de verificar (B1)

1. `obtener_actividad` solo etiqueta pipeline/clientes/órdenes (folio viejo) y nunca se actualizó tras B1 → eventos de B4–B8 sin etiqueta legible (R-B1-34/38).
2. Acciones de permisos/usuarios no pasan `correlationId` a `registrarLog` (R-B1-35).
3. Carrera en guarda de último admin (`cambiar_rol_usuario`/`cambiar_estado_usuario` bloquean solo la fila objetivo) (R-B1-09).
4. `actualizar_permisos_rol` sin lock ni CAS (R-B1-41).
5. `firmarLecturaArchivo` no valida vigencia ni permiso (IDOR depende del llamador) (R-B1-27).
6. Versionado de archivos por `nombre_erp`: subir otro archivo con el mismo nombre oculta el anterior (R-B1-31).
7. Matriz inicial: `contador` sin `orden_cerrar_admin` pese a §5 "cierres administrativos" (R-B1-05).

## Siguiente paso

1. Corregir los hallazgos **Pendiente** de `B1-hallazgos.md` en este orden, cada uno con prueba que falla antes y pasa después, y commit propio:
   a. Migración RBAC `20261008000001_sii_b1_rbac_endurecido.sql`: helpers que ignoran permisos inactivos (H-B1-07), lock común de último admin (H-B1-06), `actualizar_permisos_rol` con lock + CAS por conjunto esperado (H-B1-05), auditoría dentro de las RPC con antes/después y `correlation_id` (H-B1-09, H-B1-13), matriz: `contador` con `orden_cerrar_admin`, `ver_clientes` y `ver_pipeline_equipo` (H-B1-02, H-B1-03).
   b. TS de permisos: nuevas firmas, conjunto esperado, sin inactivos, `correlationId`.
   c. Catálogos: `actualizado_por`/`actualizado_en` + CAS + actor en versiones + `correlationId` (H-B1-14, H-B1-15, H-B1-22, H-B1-24 parcial).
2. Al terminar la tanda 2: registrar sus hallazgos, corregir los de B1.
3. Gates (typecheck, lint, unit, pgTAP, integración/E2E focales de B1), simplificación, reporte B1 y alto hasta confirmación del PO.
