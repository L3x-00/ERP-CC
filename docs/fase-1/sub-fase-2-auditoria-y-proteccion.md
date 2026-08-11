# Fase 1 · Subfase 2 — Auditoría y protección de acceso

## Objetivo

Dar trazabilidad a las acciones sensibles y limitar ataques de fuerza bruta sin añadir infraestructura innecesaria.

## Implementado

- Tabla inmutable de `logs` y servicio de auditoría para registrar actor, acción, módulo, recurso y detalle.
- Rate limiting atómico en Postgres: cinco intentos fallidos de PIN bloquean temporalmente la IP.
- Middleware de protección de rutas y resolución server-side de permisos.
- Pruebas de sesión HMAC, esquemas, permisos y limitación de intentos.

## Resultado

La plataforma ya no depende de comparaciones de PIN en el navegador ni de logs transitorios. La seguridad queda incorporada antes de abrir módulos de negocio.
