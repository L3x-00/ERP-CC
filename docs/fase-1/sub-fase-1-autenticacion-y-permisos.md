# Fase 1 · Subfase 1 — Autenticación y permisos

## Objetivo

Reemplazar la autenticación ficticia del sistema anterior por identidad verificable y autorización granular.

## Implementado

- Login administrativo con Supabase Auth y verificación de usuario activo.
- Sesión de operador basada en PIN, hash bcrypt y cookie HMAC con expiración por inactividad.
- Tabla `usuarios`, matriz `permisos_rol` y función `can(usuario, permiso)`.
- Roles operativos: administrador, vendedor, gerente, contador y operador.
- Permisos para clientes, aprobación, pagos, gastos, saldos, eliminación, finanzas, pipeline, configuración y cancelación de órdenes en proceso.
- Trigger de aprovisionamiento automático que crea el perfil de aplicación al registrarse un usuario de Supabase Auth.

## Seguridad

- Los usuarios inactivos pierden acceso en cada resolución de sesión.
- Los mensajes de login son uniformes para no revelar si una cuenta existe o está desactivada.
- Las acciones que modifican RBAC requieren rol administrador explícito, evitando autoescalación de privilegios.
