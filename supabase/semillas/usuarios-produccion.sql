-- =============================================================================
-- Operación manual: usuarios, roles y PIN de producción — ORCA MFG ERP
-- Ejecutar en Supabase → SQL Editor sobre el proyecto de producción.
--
-- Requisitos previos:
--   1. Las 51 migraciones aplicadas.
--   2. Cada persona ya creada en Authentication → Users → Add user
--      (marcar "Auto Confirm User"). El trigger `trigger_nuevo_usuario_auth`
--      crea la fila en public.usuarios con rol 'vendedor' por defecto.
--
-- Este archivo NO contiene secretos. Edita los correos antes de ejecutar.
-- Los roles válidos son fijos: admin | gerente | vendedor | contador | operador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Asignar rol a cada persona (editar correos; borrar los bloques que no
--    apliquen antes de ejecutar).
-- -----------------------------------------------------------------------------
UPDATE public.usuarios SET rol = 'admin'
WHERE email = 'admin@tudominio.com';

UPDATE public.usuarios SET rol = 'gerente'
WHERE email = 'gerente@tudominio.com';

UPDATE public.usuarios SET rol = 'vendedor'
WHERE email = 'vendedor@tudominio.com';

UPDATE public.usuarios SET rol = 'contador'
WHERE email = 'contador@tudominio.com';

UPDATE public.usuarios SET rol = 'operador'
WHERE email = 'operador@tudominio.com';

-- Cualquier otro operador de piso adicional:
-- UPDATE public.usuarios SET rol = 'operador' WHERE email = 'operador2@tudominio.com';

-- -----------------------------------------------------------------------------
-- 2) PIN de operadores de piso (bcrypt compatible con bcryptjs de la app).
--    Cambiar 'CAMBIA-ESTE-PIN' por un PIN numérico de 4 a 6 dígitos.
--    Cada operador debe tener un PIN único: la app falla cerrado si dos
--    operadores activos comparten PIN.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

UPDATE public.usuarios
SET pin_operador = extensions.crypt('CAMBIA-ESTE-PIN', extensions.gen_salt('bf', 10))
WHERE email = 'operador@tudominio.com' AND rol = 'operador';

-- UPDATE public.usuarios
-- SET pin_operador = extensions.crypt('CAMBIA-ESTE-PIN-2', extensions.gen_salt('bf', 10))
-- WHERE email = 'operador2@tudominio.com' AND rol = 'operador';

-- -----------------------------------------------------------------------------
-- 3) Desactivar accesos que no deban operar (opcional, reversible).
-- -----------------------------------------------------------------------------
-- UPDATE public.usuarios SET activo = false WHERE email = 'ex-empleado@tudominio.com';

-- -----------------------------------------------------------------------------
-- 4) Verificación: rol, estado y si tiene PIN configurado.
-- -----------------------------------------------------------------------------
SELECT email, rol, activo, (pin_operador IS NOT NULL) AS tiene_pin, ultimo_login_at
FROM public.usuarios
ORDER BY rol, email;

-- -----------------------------------------------------------------------------
-- 5) Permisos granulares: el seed de la migración 20260703000002 ya asigna
--    admin=10, gerente=4, vendedor=2, contador=4, operador=0 permisos.
--    Para ajustar la matriz (ej. dar 'ver_finanzas' a un gerente):
-- -----------------------------------------------------------------------------
-- INSERT INTO public.permisos_rol (rol, permiso)
-- VALUES ('gerente', 'ver_finanzas')
-- ON CONFLICT (rol, permiso) DO NOTHING;
