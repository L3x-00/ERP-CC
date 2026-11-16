-- C19/M5 — La entrega total cierra la orden y el cierre administrativo se
-- completa después. Verifica: cierre automático al 100 %, bitácora,
-- reapertura al anular la nota que cerró, cierre administrativo posterior,
-- terminalidad tras el cierre administrativo y bloqueo con entrega parcial.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(22);

-- -----------------------------------------------------------------------------
-- 0. Actor
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c1901', 'c19-admin@prueba.local');
UPDATE public.usuarios
SET rol = 'admin', activo = true, nombre_completo = 'Admin C19'
WHERE id = '00000000-0000-4000-8000-0000000c1901';

-- -----------------------------------------------------------------------------
-- 1. Estructura
-- -----------------------------------------------------------------------------
SELECT has_function(
  'privado', 'pendientes_entrega_orden', ARRAY['uuid'],
  'C19: existe la regla única de pendientes de entrega'
);
SELECT has_trigger(
  'public', 'partidas_nota_entrega', 'trg_partidas_nota_cerrar_orden',
  'C19: la entrega dispara el cierre de la orden'
);
SELECT has_trigger(
  'public', 'notas_entrega', 'trg_notas_entrega_reabrir_orden',
  'C19: anular la nota puede reabrir la orden'
);

-- -----------------------------------------------------------------------------
-- 2. Fixtures: cliente, dos órdenes completadas y sus partidas
-- -----------------------------------------------------------------------------
INSERT INTO public.clientes (nombre_comercial, razon_social, estado, condiciones_pago)
VALUES ('C19 Cliente', 'C19 Cliente SA de CV', 'activo', 'contado');

CREATE TEMP TABLE c19_ids (nombre text PRIMARY KEY, valor uuid) ON COMMIT DROP;
INSERT INTO c19_ids (nombre, valor)
SELECT 'cliente', id FROM public.clientes WHERE razon_social = 'C19 Cliente SA de CV';

INSERT INTO public.ordenes_produccion (
  folio, folio_sii, cliente_id, estado, estado_sii, prioridad, fecha_compromiso
) VALUES
  ('O-1126_91', 'O-1126_91', (SELECT valor FROM c19_ids WHERE nombre = 'cliente'),
   'completada', 'PRODUCCION_COMPLETADA', 'normal', now() + interval '10 days'),
  ('O-1126_92', 'O-1126_92', (SELECT valor FROM c19_ids WHERE nombre = 'cliente'),
   'completada', 'PRODUCCION_COMPLETADA', 'normal', now() + interval '10 days');

INSERT INTO c19_ids (nombre, valor)
SELECT 'orden_a', id FROM public.ordenes_produccion WHERE folio = 'O-1126_91';
INSERT INTO c19_ids (nombre, valor)
SELECT 'orden_b', id FROM public.ordenes_produccion WHERE folio = 'O-1126_92';

INSERT INTO public.partidas_orden_produccion (
  orden_id, codigo_pieza, codigo_item, descripcion, cantidad_solicitada,
  cantidad_producida, unidad_medida
)
SELECT (SELECT valor FROM c19_ids WHERE nombre = 'orden_a'),
  'IT01', 'IT01', 'Pieza C19 A', 10, 10, 'pieza'
UNION ALL
SELECT (SELECT valor FROM c19_ids WHERE nombre = 'orden_b'),
  'IT01', 'IT01', 'Pieza C19 B', 10, 10, 'pieza';

INSERT INTO c19_ids (nombre, valor)
SELECT 'partida_a', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a');
INSERT INTO c19_ids (nombre, valor)
SELECT 'partida_b', id FROM public.partidas_orden_produccion
WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_b');

CREATE TEMP TABLE c19_notas (clave text PRIMARY KEY, valor uuid) ON COMMIT DROP;

SELECT is(
  privado.pendientes_entrega_orden((SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  1, 'Antes de entregar, la partida está pendiente'
);

-- -----------------------------------------------------------------------------
-- 3. Entrega total: la orden se cierra sola
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    'SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_a'),
    '[{"partida_id":"' || (SELECT valor::text FROM c19_ids WHERE nombre = 'partida_a')
      || '","cantidad_entregada":10}]',
    'Almacén C19', '00000000-0000-4000-8000-0000000c1901'
  ),
  'La entrega total se registra'
);
INSERT INTO c19_notas (clave, valor)
SELECT 'nota_a1', id FROM public.notas_entrega
WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')
ORDER BY creado_en DESC LIMIT 1;

SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'CERRADA', 'La entrega del 100 % cierra la orden automáticamente'
);
SELECT ok(
  (SELECT cerrada_admin_en IS NULL AND cerrada_admin_por IS NULL
   FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'El cierre por entrega no confirma el cierre administrativo'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.orden_eventos_cambio
    WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')
      AND tipo = 'cierre_por_entrega'
  ),
  'El cierre por entrega queda en la bitácora'
);
SELECT is(
  (SELECT es_parcial FROM public.notas_entrega
   WHERE id = (SELECT valor FROM c19_notas WHERE clave = 'nota_a1')),
  false, 'La nota que completa la orden se marca como final (M6)'
);

-- -----------------------------------------------------------------------------
-- 4. Anular la nota que cerró reabre la orden
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    'SELECT public.anular_nota_entrega(%L, %L, %L)',
    (SELECT valor::text FROM c19_notas WHERE clave = 'nota_a1'),
    'Error de captura en la entrega',
    '00000000-0000-4000-8000-0000000c1901'
  ),
  'La nota se anula'
);
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'PRODUCCION_COMPLETADA', 'Al anular la nota la orden vuelve a PRODUCCION_COMPLETADA'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.orden_eventos_cambio
    WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')
      AND tipo = 'reapertura_por_anulacion_entrega'
  ),
  'La reapertura queda en la bitácora'
);

-- -----------------------------------------------------------------------------
-- 5. Nueva entrega total y cierre administrativo posterior
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    'SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_a'),
    '[{"partida_id":"' || (SELECT valor::text FROM c19_ids WHERE nombre = 'partida_a')
      || '","cantidad_entregada":10}]',
    'Almacén C19', '00000000-0000-4000-8000-0000000c1901'
  ),
  'La segunda entrega total se registra'
);
INSERT INTO c19_notas (clave, valor)
SELECT 'nota_a2', id FROM public.notas_entrega
WHERE orden_id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')
  AND estado = 'VIGENTE'
ORDER BY creado_en DESC LIMIT 1;

SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'CERRADA', 'La segunda entrega vuelve a cerrar la orden'
);

SELECT lives_ok(
  format(
    'SELECT public.cerrar_orden_administrativa(%L, %L, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_a'),
    (SELECT actualizado_en::text FROM public.ordenes_produccion
     WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
    '00000000-0000-4000-8000-0000000c1901'
  ),
  'El cierre administrativo completa una orden ya cerrada por entrega'
);
SELECT ok(
  (SELECT cerrada_admin_en IS NOT NULL AND cerrada_admin_por IS NOT NULL
   FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'El cierre administrativo registra fecha y actor'
);
SELECT throws_ok(
  format(
    'SELECT public.cerrar_orden_administrativa(%L, %L, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_a'),
    (SELECT actualizado_en::text FROM public.ordenes_produccion
     WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
    '00000000-0000-4000-8000-0000000c1901'
  ),
  '23514', 'orden_ya_cerrada', 'Un segundo cierre administrativo se rechaza'
);

-- Con el cierre administrativo confirmado, anular la nota no reabre.
SELECT lives_ok(
  format(
    'SELECT public.anular_nota_entrega(%L, %L, %L)',
    (SELECT valor::text FROM c19_notas WHERE clave = 'nota_a2'),
    'Ajuste posterior documentado',
    '00000000-0000-4000-8000-0000000c1901'
  ),
  'La nota se anula después del cierre administrativo'
);
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_a')),
  'CERRADA', 'El cierre administrativo confirmado es terminal'
);

-- -----------------------------------------------------------------------------
-- 6. Entrega parcial: no cierra ni permite el cierre administrativo
-- -----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    'SELECT public.registrar_entrega(%L, %L, %L, NULL, NULL, NULL, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_b'),
    '[{"partida_id":"' || (SELECT valor::text FROM c19_ids WHERE nombre = 'partida_b')
      || '","cantidad_entregada":4}]',
    'Almacén C19', '00000000-0000-4000-8000-0000000c1901'
  ),
  'La entrega parcial se registra'
);
SELECT is(
  (SELECT estado_sii FROM public.ordenes_produccion
   WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_b')),
  'PRODUCCION_COMPLETADA', 'Una entrega parcial no cierra la orden'
);
SELECT throws_ok(
  format(
    'SELECT public.cerrar_orden_administrativa(%L, %L, %L)',
    (SELECT valor::text FROM c19_ids WHERE nombre = 'orden_b'),
    (SELECT actualizado_en::text FROM public.ordenes_produccion
     WHERE id = (SELECT valor FROM c19_ids WHERE nombre = 'orden_b')),
    '00000000-0000-4000-8000-0000000c1901'
  ),
  '23514', 'orden_no_entregada_completa',
  'El cierre administrativo sigue exigiendo el 100 % entregado'
);

SELECT * FROM finish();
ROLLBACK;
