# Plan de integración del Tutorial de configuración

>Estado: **plan aprobado por el Product Owner, en ejecución por fases**.
>Fecha: 2026-11-27.
>Relacionado: `docs/PLAN-CORRECCION-CONFIGURACION.md` (investigación del flujo real).

## Decisiones cerradas

| Decisión | Valor |
| --- | --- |
| Entrada | Botón **«Tutorial de configuración»** en el encabezado de Configuración, apagado por defecto |
| Avance | Manual: **Siguiente** / **Salir** / **Reiniciar** |
| Persistencia | Ninguna: al recargar, el tutorial queda apagado y vuelve al paso 1 |
| Alcance | Flujo completo real (9 pasos) |
| Fuente de texto | La tabla única del índice del manual |

## Fases

1. **Corrección documental**: unificar el orden en el índice, primeros pasos y verificación final; corregir capacidad y tarifas.
2. **Enlaces profundos y anclas**: IDs estables por subbloque y navegación `?pestana=…&foco=…` con resaltado.
3. **Componente `GuiaConfiguracion`**: toggle, registro de pasos, tarjeta contextual, parpadeo y botones Siguiente/Salir/Reiniciar.
4. **Contenido de los 9 pasos**: microcopia amigable y destino exacto de cada paso.
5. **Reintegración visual y jerarquía**: orden de pestañas alineado al flujo y textos de ayuda con enlaces específicos.
6. **Verificación**: unitarias, E2E del recorrido, build, lint, revisión cruzada y de UI.
7. **PR, CI y merge**: un PR por fase, con el mismo ciclo del repositorio.

## Criterio de éxito

Una persona sin conocimientos técnicos pueda terminar con **al menos una máquina dada de alta, asignada a su área de trabajo y con su tarifa**, siguiendo la guía.

## Riesgos

- Permisos divididos entre `catalogo_editar` y `configuracion`.
- Trabajo ajeno sin commitear en Producción: cada fase se ejecuta en worktree aislado.
- Sin persistencia: el avance se pierde al recargar (decisión aceptada).
- El resaltado debe respetar `reduced-motion`.
