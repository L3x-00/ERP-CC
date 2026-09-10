# Sub-fase 11.1 — Esquemas maestros y tipos estrictos

## Objetivo

Crear la base segura de configuración global de ORCA MFG ERP sin introducir
datos operativos reales.

## Implementación

- Migración generada por Supabase CLI: `20260910011548_fase_11_configuracion_base.sql`.
- Singleton `configuracion_sistema` con `id = 'main'`, bloques `empresa_json`,
  `tarifas_json` y `plantillas_doc_json`, tipo de cambio, IVA y actor de última
  modificación.
- Catálogos `cuentas_bancarias` y `areas_trabajo_config`, con restricciones de
  formato, finitud numérica, moneda, color y unicidad.
- Índices de consulta, triggers de `actualizado_en`, RLS activa, lectura solo
  para usuarios con `configuracion` y escrituras reservadas a `service_role`.
- Realtime publicado para las tres tablas; el cliente recibe señal y vuelve a
  consultar bajo RLS.
- Contratos PascalCase, mappers snake_case→camelCase y fallbacks para JSONB
  incompleto en `src/modulos/configuracion/tipos/`.
- Validaciones Zod v4 strict para empresa, tarifas, cuentas, áreas, plantillas
  y tipo de cambio.

## Seguridad y concurrencia

La RPC `actualizar_configuracion_seccion` valida actor activo admin o con
permiso `configuracion`, bloquea la fila singleton con `FOR UPDATE` y modifica
solo la sección indicada. Las plantillas se combinan por clave para no perder
cambios concurrentes. No se conceden políticas de INSERT/UPDATE/DELETE a
`authenticated`.

## Estado de verificación

La migración fue creada con el CLI, pero no se pudo ejecutar ni listar contra
Supabase por `LegacyDbConfigLoginRoleStatusError` (HTTP 403) de la cuenta
vinculada. Tampoco hay PostgreSQL local disponible. Los tipos de Supabase se
ampliaron manualmente como puente explícito y deben regenerarse al recuperar el
acceso.
