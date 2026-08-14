# Sub-fase 7.3 — Acciones, seguridad y estado de interfaz

Fecha: 2026-08-14

## Resultado

Se añadieron Server Actions para iniciar y cerrar sesiones, generar notas y consultar el tablero. Cada mutación valida Zod, obtiene la identidad de servidor, ejecuta el servicio privilegiado, registra auditoría y devuelve mensajes genéricos al navegador.

## Seguridad de piso

- El inicio y cierre requieren una cookie HMAC de operador activa; el navegador nunca proporciona el `operadorId`.
- El cierre vuelve a confirmar el PIN contra ese mismo operador y aplica rate limiting. Un PIN duplicado falla cerrado durante el acceso de piso, en lugar de elegir una identidad por orden de consulta.
- La generación de nota de entrega requiere `gestionar_produccion`; el creador y el folio se resuelven en servidor y PostgreSQL.
- Los detalles de errores SQL se registran internamente, sin propagarse a la interfaz.

## Estado y sincronización

`usarTiendaProduccion` conserva únicamente filtros, selección y la referencia de sesión de la interfaz. Las órdenes, partidas, sesiones y notas permanecen en TanStack Query como datos de servidor. Realtime invalida `['produccion', 'tablero']` y vuelve a consultar con RLS, sin usar payloads de difusión como datos de negocio.
