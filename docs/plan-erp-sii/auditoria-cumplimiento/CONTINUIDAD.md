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

## Hipótesis propias pendientes de verificar (B1)

1. `obtener_actividad` solo etiqueta pipeline/clientes/órdenes (folio viejo) y nunca se actualizó tras B1 → eventos de B4–B8 sin etiqueta legible (R-B1-34/38).
2. Acciones de permisos/usuarios no pasan `correlationId` a `registrarLog` (R-B1-35).
3. Carrera en guarda de último admin (`cambiar_rol_usuario`/`cambiar_estado_usuario` bloquean solo la fila objetivo) (R-B1-09).
4. `actualizar_permisos_rol` sin lock ni CAS (R-B1-41).
5. `firmarLecturaArchivo` no valida vigencia ni permiso (IDOR depende del llamador) (R-B1-27).
6. Versionado de archivos por `nombre_erp`: subir otro archivo con el mismo nombre oculta el anterior (R-B1-31).
7. Matriz inicial: `contador` sin `orden_cerrar_admin` pese a §5 "cierres administrativos" (R-B1-05).

## Siguiente paso

Lanzar la revisión de B1 en 2 tandas de 2 lentes por área (L1 roles/permisos, L2 catálogos; L3 archivos, L4 Actividad/auditoría + UX/alcance), registrar aquí los hallazgos de cada tanda, verificar y corregir con pruebas, y entregar el reporte de B1.
