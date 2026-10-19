# Documentación de ORCA MFG ERP v2

Esta carpeta registra el avance funcional y técnico del ERP de CC Manufacturing Group. El código y las migraciones del repositorio son la fuente de verdad ejecutable; estos documentos explican el alcance, las decisiones y el estado de cada entrega.

## Estado actual (2026-10-19)

Las correcciones del cliente para **Órdenes C8, Planeación C9 y Finanzas C10** están cerradas localmente. Finanzas C10.1–C10.3 están fusionadas y sus migraciones aplicadas en remoto; C10.4 (aceptación E2E y registro) está en el PR de cierre. La aceptación del cliente/PO y cualquier corrección futura parten de `origin/main`.

- [Checkpoint de ejecución](observaciones-cliente-2026-10-07/CHECKPOINT-EJECUCION.md) — estado reanudable.
- [Decisiones aceptadas](observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md) — fuente funcional.
- [Reporte de hallazgos](observaciones-cliente-2026-10-07/REPORTE-HALLAZGOS-Y-CORRECCIONES.md).
- [CUELLOS-DE-BOTELLA.md](CUELLOS-DE-BOTELLA.md) — fallos reales y prevención.
- [ADR-0016 — cierre de Finanzas C10](../.ai-shared/memory/decisions/ADR-0016-cierre-finanzas-c10.md).

## Documentos transversales

- [Auditoría funcional y paridad — 164 requisitos, 13-09-2026](auditoria-funcional-2026-09-13/README.md): inventario completo y evidencia local; aceptación E2E pendiente. Los estados de fase del historial no equivalen a aceptación de este catálogo.
- [Contexto del proyecto](contexto.md)
- [Arquitectura](arquitectura.md)
- [Alcance y roadmap](alcance.md)

## Historial por fase

| Fase | Módulo | Estado | Documentación |
| --- | --- | --- | --- |
| 0 | Base del proyecto | Completada | [Fase 0](fase-0/) |
| 1 | Autenticación, permisos y auditoría | Completada | [Fase 1](fase-1/) |
| 2 | Pipeline / CRM | Completada | [Fase 2](fase-2/) |
| 3 | Clientes | Completada | [Fase 3](fase-3/) |
| 4 | Inventario / Compras | Completada | [Fase 4](fase-4/) |
| 5 | Órdenes de Producción | Completada y endurecida | [Fase 5](fase-5/) |
| 6 | Planeación y capacidad | Sub-fases 6.1 y 6.2 completadas | [Fase 6](fase-6/) |
| 7 | Producción | Cerrada técnicamente | [Fase 7](fase-7/) |
| 8 | Cuentas por cobrar | Cerrada técnicamente | [Fase 8](fase-8/) |
| 9 | Gastos, CxP y rentabilidad | Implementada localmente; gate remoto pendiente | [Fase 9](fase-9/) |
| 10 | Dashboard por rol y métricas | Implementada localmente; gate remoto pendiente | [Fase 10](fase-10/) |
| 11 | Configuración maestra | Implementada localmente; gate remoto pendiente | [Fase 11](fase-11/) |
| 12 | Comentarios y notificaciones | Implementada localmente; gate remoto pendiente | [Fase 12](fase-12/) |

Las fases futuras se documentarán al iniciar su implementación. Cada subfase incluye objetivo, cambios, seguridad, pruebas y pendientes relevantes.
