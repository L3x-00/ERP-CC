-- SII-B2 — Clientes: folio CLI-####, alta atómica, comercial/estado y contactos lógicos.
-- Verifica: unicidad/no reutilización/backfill/inmutabilidad del folio, coherencia
-- de crédito, rollback de la RPC atómica, transiciones + CAS, un solo principal
-- activo y baja lógica de contactos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(75);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000b2a01', 'sii-b2-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000b2a02', 'sii-b2-operador@prueba.local'),
  ('00000000-0000-4000-8000-0000000b2a03', 'sii-b2-inactivo@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin B2'
WHERE id = '00000000-0000-4000-8000-0000000b2a01';
UPDATE public.usuarios SET rol = 'operador', activo = true, nombre_completo = 'Operador B2'
WHERE id = '00000000-0000-4000-8000-0000000b2a02';
UPDATE public.usuarios SET rol = 'admin', activo = false, nombre_completo = 'Admin Inactivo B2'
WHERE id = '00000000-0000-4000-8000-0000000b2a03';

-- -----------------------------------------------------------------------------
-- 1. Folio CLI-####: estructura, privilegios y trigger
-- -----------------------------------------------------------------------------
SELECT has_column('public', 'clientes', 'folio', 'clientes.folio existe');
SELECT ok(
  has_function_privilege('service_role', 'public.generar_folio_cliente()', 'EXECUTE'),
  'service_role ejecuta generar_folio_cliente'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.generar_folio_cliente()', 'EXECUTE'),
  'authenticated no ejecuta generar_folio_cliente'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.generar_folio_cliente()', 'EXECUTE'),
  'anon no ejecuta generar_folio_cliente'
);

SELECT lives_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'ACME B2',
      'razon_social', 'ACME B2 SA de CV',
      'rfc', 'ABC010101AA1',
      'correo', 'contacto@acmeb2.mx',
      'condiciones_pago', 'credito',
      'contacto', jsonb_build_object(
        'nombre', 'Ana Compras',
        'puesto', 'Compras',
        'correo', 'ana@acmeb2.mx',
        'telefono', '555-0101'
      )
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, 'alta atómica cliente + contacto principal');

SELECT matches(
  (SELECT folio FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  '^CLI-[0-9]{4,}$',
  'el trigger asigna folio CLI-####'
);
SELECT is(
  (SELECT contacto FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  'Ana Compras',
  'la cabecera legada conserva el nombre del contacto principal'
);
SELECT is(
  (SELECT count(*) FROM public.contactos_cliente c
   JOIN public.clientes cl ON cl.id = c.cliente_id
   WHERE cl.razon_social = 'ACME B2 SA de CV' AND c.es_principal AND c.activo),
  1::bigint,
  'el contacto principal activo se crea en la misma transacción'
);
SELECT is(
  (SELECT moneda FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  'MXN',
  'moneda default MXN'
);
SELECT is(
  (SELECT credito_habilitado FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  true,
  'condiciones_pago credito habilita el crédito'
);
SELECT is(
  (SELECT dias_credito FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  45,
  'condiciones_pago credito deriva 45 días'
);

-- -----------------------------------------------------------------------------
-- 2. Folio único, no reutilizable e inmutable
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Metalúrgica B2',
      'razon_social', 'Metalúrgica B2 SA de CV',
      'rfc', 'MBC020202BB2',
      'correo', 'contacto@metalurgicab2.mx'
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, 'segundo alta sin contacto (compatibilidad)');

SELECT isnt(
  (SELECT folio FROM public.clientes WHERE razon_social = 'Metalúrgica B2 SA de CV'),
  (SELECT folio FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
  'cada cliente recibe un folio distinto'
);
SELECT ok(
  (SELECT count(DISTINCT folio) FROM public.clientes WHERE folio IS NOT NULL) =
  (SELECT count(*) FROM public.clientes WHERE folio IS NOT NULL),
  'no hay folios duplicados'
);
SELECT is(
  (SELECT count(*) FROM public.contactos_cliente c
   JOIN public.clientes cl ON cl.id = c.cliente_id
   WHERE cl.razon_social = 'Metalúrgica B2 SA de CV'),
  0::bigint,
  'el contacto es opcional para llamadores legados'
);

SELECT throws_ok(
  format(
    'INSERT INTO public.clientes (nombre_comercial, razon_social, folio) VALUES (%L, %L, %L)',
    'Duplicado B2', 'Duplicado Folio B2 SA',
    (SELECT folio FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV')
  ),
  '23505', NULL, 'el índice único rechaza un folio repetido'
);

SELECT throws_ok(
  format(
    'UPDATE public.clientes SET folio = %L WHERE razon_social = %L',
    'CLI-9999', 'ACME B2 SA de CV'
  ),
  '22023', 'folio_inmutable', 'el folio asignado no se puede cambiar'
);

-- Backfill idempotente: filas sin folio (como llegaría una fila histórica).
ALTER TABLE public.clientes DISABLE TRIGGER trigger_clientes_folio;
INSERT INTO public.clientes (nombre_comercial, razon_social) VALUES
  ('Backfill Uno B2', 'Backfill Uno B2 SA'),
  ('Backfill Dos B2', 'Backfill Dos B2 SA');
ALTER TABLE public.clientes ENABLE TRIGGER trigger_clientes_folio;

SELECT is(
  privado.asignar_folios_cliente_pendientes(),
  2,
  'el backfill asigna folio a las filas pendientes en orden de creación'
);
SELECT is(
  privado.asignar_folios_cliente_pendientes(),
  0,
  'el backfill es idempotente'
);
SELECT is(
  (SELECT count(*) FROM public.clientes WHERE folio IS NULL),
  0::bigint,
  'ningún cliente queda sin folio'
);

-- -----------------------------------------------------------------------------
-- 3. Coherencia comercial
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, moneda)
  VALUES ('Moneda B2', 'Moneda Invalida B2 SA', 'EUR')
$$, '23514', NULL, 'moneda fuera de MXN/USD se rechaza');

SELECT throws_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, credito_habilitado, dias_credito)
  VALUES ('Credito B2', 'Credito Sin Dias B2 SA', true, NULL)
$$, '23514', NULL, 'crédito habilitado sin días se rechaza');

SELECT throws_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, credito_habilitado, dias_credito)
  VALUES ('Credito B2', 'Credito Excedido B2 SA', true, 400)
$$, '23514', NULL, 'días fuera de 1..365 se rechaza');

SELECT throws_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, credito_habilitado, dias_credito)
  VALUES ('Credito B2', 'Credito Apagado Con Dias B2 SA', false, 30)
$$, '23514', NULL, 'crédito apagado con días > 0 se rechaza');

SELECT lives_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, credito_habilitado, dias_credito)
  VALUES ('Credito B2', 'Credito Coherente B2 SA', true, 30)
$$, 'crédito habilitado con 30 días es válido');

SELECT lives_ok($$
  INSERT INTO public.clientes (nombre_comercial, razon_social, credito_habilitado, dias_credito)
  VALUES ('Credito B2', 'Credito Apagado B2 SA', false, 0)
$$, 'crédito apagado con 0 días es válido');

-- -----------------------------------------------------------------------------
-- 4. RPC atómica: duplicados, rollback y permisos
-- -----------------------------------------------------------------------------
SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object('nombre_comercial', 'Otra', 'razon_social', 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, '23505', 'cliente_duplicado', 'duplicado por razón social');

SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Rfc Repetido',
      'razon_social', 'Rfc Repetido B2 SA',
      'rfc', 'ABC010101AA1'
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, '23505', 'cliente_duplicado', 'duplicado por RFC');

SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Correo Repetido',
      'razon_social', 'Correo Repetido B2 SA',
      'correo', 'contacto@acmeb2.mx'
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, '23505', 'cliente_duplicado', 'duplicado por correo');

SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Rollback B2',
      'razon_social', 'Rollback B2 SA',
      'contacto', jsonb_build_object('nombre', 'Contacto Roto', 'correo', 'sin-arroba')
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, '23514', NULL, 'un contacto inválido hace fallar el alta');

SELECT is(
  (SELECT count(*) FROM public.clientes WHERE razon_social = 'Rollback B2 SA'),
  0::bigint,
  'rollback completo: no queda cliente huérfano'
);

SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object('nombre_comercial', 'Sin Permiso B2', 'razon_social', 'Sin Permiso B2 SA'),
    '00000000-0000-4000-8000-0000000b2a02'
  )
$$, '42501', 'sin_permiso', 'un operador no puede crear clientes');

SELECT throws_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object('nombre_comercial', 'Inactivo B2', 'razon_social', 'Inactivo B2 SA'),
    '00000000-0000-4000-8000-0000000b2a03'
  )
$$, '42501', 'sin_permiso', 'un actor inactivo no puede crear clientes');

SELECT lives_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Credito Explícito B2',
      'razon_social', 'Credito Explicito B2 SA',
      'moneda', 'USD',
      'credito_habilitado', true,
      'dias_credito', 20
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, 'crédito explícito con días personalizados');

SELECT is(
  (SELECT dias_credito FROM public.clientes WHERE razon_social = 'Credito Explicito B2 SA'),
  20,
  'los días explícitos se conservan'
);
SELECT is(
  (SELECT moneda FROM public.clientes WHERE razon_social = 'Credito Explicito B2 SA'),
  'USD',
  'la moneda USD se conserva'
);

-- -----------------------------------------------------------------------------
-- 5. Estado por acción con CAS
-- -----------------------------------------------------------------------------
SELECT lives_ok($$
  SELECT public.crear_cliente_con_contacto(
    jsonb_build_object(
      'nombre_comercial', 'Prospecto B2',
      'razon_social', 'Prospecto B2 SA',
      'estado', 'prospecto'
    ),
    '00000000-0000-4000-8000-0000000b2a01'
  )
$$, 'alta como prospecto');

CREATE TEMP TABLE b2_estado AS
SELECT id, actualizado_en FROM public.clientes WHERE razon_social = 'Prospecto B2 SA';

SELECT lives_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_estado), 'activo',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM b2_estado)
  ),
  'transición prospecto→activo'
);
SELECT is(
  (SELECT estado FROM public.clientes WHERE razon_social = 'Prospecto B2 SA'),
  'activo',
  'el estado quedó en activo'
);

SELECT throws_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_estado), 'inactivo', 'motivo viejo',
    '00000000-0000-4000-8000-0000000b2a01',
    '2000-01-01T00:00:00+00'
  ),
  '23514', 'cliente_desactualizado', 'CAS rechaza un token viejo'
);

SELECT throws_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_estado), 'inactivo',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.clientes WHERE razon_social = 'Prospecto B2 SA')
  ),
  '22023', 'motivo_requerido', 'inactivar exige motivo'
);

SELECT lives_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_estado), 'inactivo', 'cliente sin compras',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.clientes WHERE razon_social = 'Prospecto B2 SA')
  ),
  'transición activo→inactivo con motivo'
);

SELECT throws_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_estado), 'prospecto',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.clientes WHERE razon_social = 'Prospecto B2 SA')
  ),
  '22023', 'estado_invalido', 'inactivo→prospecto no es una transición válida'
);

SELECT lives_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_estado), 'activo',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.clientes WHERE razon_social = 'Prospecto B2 SA')
  ),
  'transición inactivo→activo'
);

SELECT throws_ok(
  format(
    'SELECT public.cambiar_estado_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_estado), 'inactivo',
    '00000000-0000-4000-8000-0000000b2a02',
    (SELECT actualizado_en::text FROM public.clientes WHERE razon_social = 'Prospecto B2 SA')
  ),
  '42501', 'sin_permiso', 'un operador no cambia el estado del cliente'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('eliminar_cliente', 'borrar_cliente', 'delete_cliente')
  ),
  'no existe RPC de borrado de clientes'
);

-- -----------------------------------------------------------------------------
-- 6. Contactos: un solo principal activo y baja lógica
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE b2_contactos AS
SELECT c.id, c.nombre
FROM public.contactos_cliente c
JOIN public.clientes cl ON cl.id = c.cliente_id
WHERE cl.razon_social = 'ACME B2 SA de CV';

INSERT INTO public.contactos_cliente (cliente_id, nombre, es_principal, creado_por)
SELECT cl.id, 'Beto Finanzas', false, '00000000-0000-4000-8000-0000000b2a01'
FROM public.clientes cl WHERE cl.razon_social = 'ACME B2 SA de CV';

CREATE TEMP TABLE b2_contacto_beto AS
SELECT c.id, c.actualizado_en
FROM public.contactos_cliente c
JOIN public.clientes cl ON cl.id = c.cliente_id
WHERE cl.razon_social = 'ACME B2 SA de CV' AND c.nombre = 'Beto Finanzas';

SELECT lives_ok(
  format(
    'SELECT public.marcar_contacto_principal(%L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  ),
  'marcar un nuevo contacto principal'
);
SELECT is(
  (SELECT count(*) FROM public.contactos_cliente c
   JOIN public.clientes cl ON cl.id = c.cliente_id
   WHERE cl.razon_social = 'ACME B2 SA de CV' AND c.es_principal AND c.activo),
  1::bigint,
  'solo un principal activo tras el cambio'
);
SELECT is(
  (SELECT es_principal FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contactos WHERE nombre = 'Ana Compras')),
  false,
  'el principal anterior deja de serlo'
);
SELECT throws_ok(
  format(
    'UPDATE public.contactos_cliente SET es_principal = true WHERE id = %L',
    (SELECT id::text FROM b2_contactos WHERE nombre = 'Ana Compras')
  ),
  '23505', NULL, 'el índice parcial rechaza dos principales activos'
);

SELECT throws_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, NULL, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto))
  ),
  '22023', 'motivo_requerido', 'la baja lógica exige motivo'
);

SELECT throws_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    'baja con token viejo',
    '00000000-0000-4000-8000-0000000b2a01',
    '2000-01-01T00:00:00+00'
  ),
  '23514', 'contacto_desactualizado', 'CAS rechaza un token viejo del contacto'
);

SELECT lives_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    'cambio de proveedor',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto))
  ),
  'baja lógica del contacto'
);
SELECT is(
  (SELECT activo FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  false,
  'el contacto queda inactivo sin borrarse'
);
SELECT is(
  (SELECT count(*) FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  1::bigint,
  'la fila del contacto se conserva (no hay borrado duro)'
);
SELECT is(
  (SELECT desactivado_por FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  '00000000-0000-4000-8000-0000000b2a01'::uuid,
  'la baja registra al actor'
);
SELECT isnt(
  (SELECT desactivado_en FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  NULL,
  'la baja registra la fecha'
);

SELECT throws_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    'otra vez',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto))
  ),
  '22023', 'contacto_ya_inactivo', 'no se puede desactivar dos veces'
);

SELECT lives_ok(
  format(
    'SELECT public.reactivar_contacto_cliente(%L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  ),
  'reactivación del contacto'
);
SELECT is(
  (SELECT activo FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  true,
  'el contacto vuelve a estar activo'
);
SELECT is(
  (SELECT desactivado_en FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto)),
  NULL,
  'la reactivación limpia la marca de baja'
);
SELECT is(
  (public.reactivar_contacto_cliente(
    (SELECT id FROM b2_contacto_beto),
    (SELECT id FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  ) ->> 'reactivado')::boolean,
  false,
  'reactivar un contacto activo es idempotente'
);

-- Guardia de principal al reactivar: dos principales activos no pueden convivir.
SELECT lives_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_contactos WHERE nombre = 'Ana Compras'),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    'baja temporal',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contactos WHERE nombre = 'Ana Compras'))
  ),
  'baja de Ana para preparar la guardia'
);
SELECT lives_ok(
  format(
    'SELECT public.desactivar_contacto_cliente(%L, %L, %L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    'baja de Beto',
    '00000000-0000-4000-8000-0000000b2a01',
    (SELECT actualizado_en::text FROM public.contactos_cliente WHERE id = (SELECT id FROM b2_contacto_beto))
  ),
  'baja de Beto para preparar la guardia'
);
UPDATE public.contactos_cliente
SET es_principal = true
WHERE id = (SELECT id FROM b2_contactos WHERE nombre = 'Ana Compras');
SELECT lives_ok(
  format(
    'SELECT public.reactivar_contacto_cliente(%L, %L, %L)',
    (SELECT id::text FROM b2_contacto_beto),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  ),
  'Beto vuelve como principal activo'
);
SELECT throws_ok(
  format(
    'SELECT public.reactivar_contacto_cliente(%L, %L, %L)',
    (SELECT id::text FROM b2_contactos WHERE nombre = 'Ana Compras'),
    (SELECT id::text FROM public.clientes WHERE razon_social = 'ACME B2 SA de CV'),
    '00000000-0000-4000-8000-0000000b2a01'
  ),
  '23505', 'principal_activo_existe',
  'reactivar un principal con otro principal activo exige resolverlo'
);

SELECT has_index(
  'public', 'contactos_cliente', 'ux_contactos_cliente_principal_activo',
  'existe el índice parcial de principal activo'
);
SELECT hasnt_index(
  'public', 'contactos_cliente', 'ux_contactos_cliente_principal',
  'el índice anterior sin filtro de activo fue reemplazado'
);

-- Privilegios: solo service_role ejecuta las RPC de B2.
SELECT ok(
  has_function_privilege('service_role', 'public.crear_cliente_con_contacto(jsonb,uuid)', 'EXECUTE'),
  'service_role ejecuta crear_cliente_con_contacto'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.crear_cliente_con_contacto(jsonb,uuid)', 'EXECUTE'),
  'authenticated no ejecuta crear_cliente_con_contacto'
);
SELECT ok(
  has_function_privilege('service_role', 'public.cambiar_estado_cliente(uuid,text,text,uuid,timestamptz)', 'EXECUTE'),
  'service_role ejecuta cambiar_estado_cliente'
);
SELECT ok(
  has_function_privilege('service_role', 'public.marcar_contacto_principal(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta marcar_contacto_principal'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.marcar_contacto_principal(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated no ejecuta marcar_contacto_principal'
);
SELECT ok(
  has_function_privilege('service_role', 'public.desactivar_contacto_cliente(uuid,uuid,text,uuid,timestamptz)', 'EXECUTE'),
  'service_role ejecuta desactivar_contacto_cliente'
);
SELECT ok(
  has_function_privilege('service_role', 'public.reactivar_contacto_cliente(uuid,uuid,uuid)', 'EXECUTE'),
  'service_role ejecuta reactivar_contacto_cliente'
);

SELECT * FROM finish();
ROLLBACK;
