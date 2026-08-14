# Sub-fase 8.3 — Acciones, permisos y estado de cartera

Fecha: 2026-08-14

## Resultado

Se implementaron Server Actions para abrir una cuenta AR, registrar un pago, aplicar saldo a favor y consultar cartera. Todas validan Zod, sesión, permiso, ejecutan un servicio y registran auditoría sin exponer errores internos.

## Permisos y datos

- `ver_finanzas` permite consultar cartera.
- `registrar_pagos` permite abrir AR y registrar pagos externos.
- `aplicar_saldos` permite usar el monedero MXN.
- Las consultas usan el cliente de sesión y permanecen detrás de RLS; las transacciones usan el cliente administrativo solo después de la autorización server-side.

`usarTiendaCobranza` conserva solo filtros, selección y señal de actualización. TanStack Query mantiene los datos del servidor; no existen copias mutables de saldos en Zustand.
