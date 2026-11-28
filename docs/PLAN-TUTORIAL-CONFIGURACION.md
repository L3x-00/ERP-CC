# Plan de integración del Tutorial de configuración

>Estado: **COMPLETADO** (7 de 7 fases fusionadas en `main`).
>Fecha: 2026-11-27 · cierre: 2026-11-28.
>Relacionado: `docs/PLAN-CORRECCION-CONFIGURACION.md` (investigación del flujo real).

## Decisiones cerradas

| Decisión | Valor |
| --- | --- |
| Entrada | Botón **«Tutorial de configuración»** en el encabezado de Configuración, apagado por defecto y solo para administradores |
| Avance | Manual: **Siguiente** / **Salir** / **Reiniciar** |
| Persistencia | Ninguna: al recargar, el tutorial queda apagado y vuelve al paso 1 |
| Alcance | Flujo completo real (9 pasos) |
| Fuente de texto | La tabla única del índice del manual |

## Fases ejecutadas

| Fase | Contenido | PR | Merge en `main` |
| --- | --- | --- | --- |
| 1 | Unificar el orden en el índice, primeros pasos y verificación final; corregir capacidad y tarifas | #326 | `5d3b1d3` |
| 2 | IDs estables por subbloque y navegación `?pestana=…&foco=…` con resaltado | #328 | `6811186` |
| 3 | `GuiaConfiguracion`: toggle, tarjeta contextual, parpadeo y Siguiente/Salir/Reiniciar | #330 | `f5074b6` |
| 4 | Contenido de los 9 pasos fijado por pruebas unitarias | #332 | `5d28c86` |
| 5 | Orden de pestañas alineado al flujo y textos de ayuda con enlaces a subsecciones | #333 | `baf4d4a` |
| 6 | E2E del recorrido y de los enlaces, revisión visual y verificación ampliada | #334 | `f9bf5ec` |
| 7 | Cierre documental, memoria compartida y limpieza del worktree | — | — |

Cada PR pasó el CI completo en verde antes de fusionarse. Las dos primeras corridas fallidas de Fase 2 y las de Fases 5 y 6 fueron fallos reales, corregidos en el mismo PR: `useSearchParams` sin router en unitarias, `setState` dentro de un efecto, una expectativa de orden de pestañas desactualizada y un spec E2E no registrado en el catálogo.

## Criterio de éxito

Una persona sin conocimientos técnicos pueda terminar con **al menos una máquina dada de alta, asignada a su área de trabajo y con su tarifa**, siguiendo la guía. Los 9 pasos llevan a Personas, Familia de máquinas, Áreas, Procesos, Máquina, Capacidad, Materiales, Canales/acciones y Verificación; el quinto paso nombra explícitamente el área y el precio.

## Verificación final

- `pnpm build`, `pnpm lint` y `pnpm typecheck`: EXIT 0.
- 3151 pruebas unitarias en verde.
- Spec `tests/e2e/tutorial-configuracion.spec.ts`: 2/2 en verde.
- Navegador: resaltado estable en 6 repeticiones, enlaces de ayuda y recorrido del tutorial comprobados; tarjeta flotante legible y con foco de teclado visible.
- Sin migraciones ni cambios de permisos, reglas de negocio o esquema.

## Riesgos (seguimiento posterior)

- Permisos divididos entre `catalogo_editar` y `configuración`: los pasos de Catálogos requieren ese permiso; la guía no lo elude.
- Sin persistencia: el avance se pierde al recargar (decisión aceptada).
- El resaltado respeta `prefers-reduced-motion`.
