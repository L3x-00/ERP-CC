# Documentación de ORCA MFG ERP

Documentación vigente del sistema en producción. El código, las migraciones y las pruebas son la fuente de verdad ejecutable; estos documentos explican el estado, la arquitectura, la tecnología y los contratos.

## Sistema

- [Estado actual](estado-actual.md) — qué está operativo, últimos cambios y pendientes.
- [Arquitectura](arquitectura.md) — capas, seguridad, concurrencia y flujos críticos.
- [Tecnologías](tecnologias.md) — stack frontend, backend, pruebas e infraestructura.
- [APIs y contratos](apis.md) — Server Actions, RPCs, integraciones externas y folios.

## Producto

- [Contexto del proyecto](contexto.md) — negocio, flujo principal y reglas funcionales.
- [Alcance](alcance.md) — módulos entregados, límites actuales y decisiones pendientes.
- [Análisis de UI y configuración](analisis-ui-configuracion.md) — observaciones del PO sobre la interfaz.

## Desarrollo

- [Cuellos de botella conocidos](CUELLOS-DE-BOTELLA.md) — fallos reales, causa y prevención. Es lectura obligatoria antes de depurar CI, migraciones o E2E.
- [Guía del repositorio](../README.md) — puesta en marcha y comandos de verificación.
- [Reglas de ingeniería](../AGENTS.md) — autoridad, roles, flujo y criterio de cierre.

## Convenciones de esta carpeta

- Un documento por tema; sin historiales de fases ni checkpoints de tandas.
- Los documentos se actualizan cuando cambia el sistema, no se acumulan versiones.
- Las decisiones arquitectónicas se registran como ADR en `.ai-shared/memory/decisions/`.
