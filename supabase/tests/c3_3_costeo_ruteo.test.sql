-- C3.3 — Snapshot y desglose del costeo de ruteo (DC-07).
-- Verifica: permiso, bloqueo sin tarifa o con moneda distinta (todo o nada),
-- snapshot por renglón (GRUPO/RECURSO), inmutabilidad ante cambios del
-- maestro y totales sin doble conteo con el costo manual `maquina`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT plan(16);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000c3301', 'c33-admin@prueba.local'),
  ('00000000-0000-4000-8000-0000000c3302', 'c33-vendedor@prueba.local');
UPDATE public.usuarios SET rol = 'admin', activo = true, nombre_completo = 'Admin C33'
WHERE id = '00000000-0000-4000-8000-0000000c3301';
UPDATE public.usuarios SET rol = 'vendedor', activo = true, nombre_completo = 'Vendedor C33'
WHERE id = '00000000-0000-4000-8000-0000000c3302';

INSERT INTO public.catalogo_materiales (codigo, nombre) VALUES ('C33MAT', 'Acero C33');
INSERT INTO public.catalogo_procesos (codigo, nombre, prefijo_corrida, requiere_archivo_tecnico)
VALUES ('C33LAS', 'Láser C33', 'CLAS', false);
INSERT INTO public.grupos_equipo (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c3310', 'C33LASER', 'Láser C33');
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, grupo_equipo_id)
VALUES ('00000000-0000-4000-8000-0000000c3311', 'C33-L1', 'sheet_metal', 'Láser 1 C33',
        '00000000-0000-4000-8000-0000000c3310');
INSERT INTO public.clientes (id, nombre_comercial, razon_social, estado)
VALUES ('00000000-0000-4000-8000-0000000c3320', 'C33 Cliente', 'C33 Cliente SA', 'activo');

INSERT INTO public.pipeline (
  id, folio_op, etapa, estado_rfq, nombre_contacto, empresa, cliente_id, vendedor_id, moneda
) VALUES (
  '00000000-0000-4000-8000-0000000c3330', 'OP-C33-1', 'negociacion', 'READY_FOR_PROPOSAL',
  'Contacto C33', 'C33 Empresa', '00000000-0000-4000-8000-0000000c3320',
  '00000000-0000-4000-8000-0000000c3302', 'MXN'
);
INSERT INTO public.rfq_items (id, rfq_id, numero, codigo, descripcion, cantidad, material_id)
SELECT '00000000-0000-4000-8000-0000000c3331', '00000000-0000-4000-8000-0000000c3330', 1, 'IT01',
  'Placa C33', 10, id FROM public.catalogo_materiales WHERE codigo = 'C33MAT';
INSERT INTO public.rfq_item_operaciones (rfq_item_id, proceso_id, orden)
SELECT '00000000-0000-4000-8000-0000000c3331', id, 1 FROM public.catalogo_procesos WHERE codigo = 'C33LAS';

CREATE TEMP TABLE c33 ON COMMIT DROP AS
SELECT (public.crear_propuesta('00000000-0000-4000-8000-0000000c3330',
  '00000000-0000-4000-8000-0000000c3301')->>'revisionId')::uuid AS revision_id;
GRANT SELECT ON c33 TO service_role;

UPDATE public.propuesta_item_ruteo AS rt
SET grupo_equipo_id = '00000000-0000-4000-8000-0000000c3310', setup_horas = 1.5, run_horas = 2
FROM public.propuesta_items AS i
WHERE i.id = rt.item_id AND i.revision_id = (SELECT revision_id FROM c33);

-- 1-3. Permiso y bloqueo sin tarifa (todo o nada)
SELECT throws_ok(
  format($$SELECT public.costear_ruteo_revision(%L, %L)$$,
    (SELECT revision_id FROM c33), '00000000-0000-4000-8000-0000000c3302'),
  '42501', 'sin_permiso_propuesta', 'sin propuesta_editar_costo no se costea');
SELECT throws_ok(
  format($$SELECT public.costear_ruteo_revision(%L, %L)$$,
    (SELECT revision_id FROM c33), '00000000-0000-4000-8000-0000000c3301'),
  '23514', 'tarifa_no_configurada', 'sin tarifa el costeo se bloquea');
SELECT is(
  (SELECT count(*)::integer FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id
   WHERE i.revision_id = (SELECT revision_id FROM c33) AND rt.costeado_en IS NOT NULL),
  0, 'el bloqueo no deja renglones a medias');

-- 4-6. Costeo con la tarifa del grupo y snapshot por renglón
UPDATE public.grupos_equipo SET tarifa_hora = 100, tarifa_moneda = 'MXN'
WHERE id = '00000000-0000-4000-8000-0000000c3310';
SELECT is(
  public.costear_ruteo_revision((SELECT revision_id FROM c33), '00000000-0000-4000-8000-0000000c3301'),
  jsonb_build_object('renglones', 1, 'costoRuteo', 350.0000, 'moneda', 'MXN'),
  'costea preparación + operación con la misma tarifa');
SELECT results_eq(
  format($$SELECT tarifa_hora, tarifa_moneda, tarifa_fuente, costo_setup, costo_run, costo_total
           FROM public.propuesta_item_ruteo AS rt JOIN public.propuesta_items AS i ON i.id = rt.item_id
           WHERE i.revision_id = %L$$, (SELECT revision_id FROM c33)),
  $$VALUES (100.0000::numeric, 'MXN'::text, 'GRUPO'::text, 150.0000::numeric, 200.0000::numeric, 350.0000::numeric)$$,
  'el renglón congela tarifa, moneda, fuente y costos');
UPDATE public.grupos_equipo SET tarifa_hora = 999 WHERE id = '00000000-0000-4000-8000-0000000c3310';
SELECT is(
  (SELECT rt.tarifa_hora FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id WHERE i.revision_id = (SELECT revision_id FROM c33)),
  100.0000::numeric, 'cambiar la tarifa maestra no altera el renglón costeado');

-- 7-9. Totales sin doble conteo
INSERT INTO public.propuesta_revision_costos (revision_id, categoria, monto)
SELECT revision_id, 'maquina', 999 FROM c33
UNION ALL SELECT revision_id, 'material', 50 FROM c33;
SELECT is(
  (public.calcular_totales_revision((SELECT revision_id FROM c33))->>'costoRuteo')::numeric,
  350.0000, 'los totales exponen el costo del ruteo');
SELECT is(
  (public.calcular_totales_revision((SELECT revision_id FROM c33))->>'costoManual')::numeric,
  50.0000, 'con ruteo costeado el manual "maquina" no se suma');
SELECT is(
  (public.calcular_totales_revision((SELECT revision_id FROM c33))->>'costoTotal')::numeric,
  400.0000, 'costo total = ruteo + manual sin "maquina"');

-- 10-11. Moneda distinta bloquea y conserva el snapshot previo
UPDATE public.grupos_equipo SET tarifa_hora = 20, tarifa_moneda = 'USD'
WHERE id = '00000000-0000-4000-8000-0000000c3310';
SELECT throws_ok(
  format($$SELECT public.costear_ruteo_revision(%L, %L)$$,
    (SELECT revision_id FROM c33), '00000000-0000-4000-8000-0000000c3301'),
  '23514', 'tarifa_moneda_distinta', 'no convierte moneda en silencio');
SELECT is(
  (SELECT rt.costo_total FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id WHERE i.revision_id = (SELECT revision_id FROM c33)),
  350.0000::numeric, 'el fallo conserva el costeo anterior');

-- 12-13. Tarifa propia de la máquina
UPDATE public.recursos_planeacion
SET tarifa_override_activa = true, tarifa_override_hora = 80, tarifa_override_moneda = 'MXN'
WHERE id = '00000000-0000-4000-8000-0000000c3311';
UPDATE public.propuesta_item_ruteo AS rt SET recurso_id = '00000000-0000-4000-8000-0000000c3311'
FROM public.propuesta_items AS i
WHERE i.id = rt.item_id AND i.revision_id = (SELECT revision_id FROM c33);
SELECT is(
  (public.costear_ruteo_revision((SELECT revision_id FROM c33), '00000000-0000-4000-8000-0000000c3301')->>'costoRuteo')::numeric,
  280.0000, 'la tarifa propia de la máquina tiene prioridad');
SELECT is(
  (SELECT rt.tarifa_fuente FROM public.propuesta_item_ruteo AS rt
   JOIN public.propuesta_items AS i ON i.id = rt.item_id WHERE i.revision_id = (SELECT revision_id FROM c33)),
  'RECURSO', 'el renglón registra la fuente RECURSO');

-- 14-15. La máquina del renglón se elige al editar el ruteo (mismo grupo)
INSERT INTO public.grupos_equipo (id, codigo, nombre)
VALUES ('00000000-0000-4000-8000-0000000c3312', 'C33DOBLEZ', 'Doblez C33');
INSERT INTO public.recursos_planeacion (id, codigo, area, nombre, grupo_equipo_id)
VALUES ('00000000-0000-4000-8000-0000000c3313', 'C33-D1', 'sheet_metal', 'Dobladora C33',
        '00000000-0000-4000-8000-0000000c3312');
CREATE TEMP TABLE c33_ruteo ON COMMIT DROP AS
SELECT i.id AS item_id, rt.proceso_id, r.actualizado_en
FROM public.propuesta_items AS i
JOIN public.propuesta_item_ruteo AS rt ON rt.item_id = i.id
JOIN public.propuesta_revisiones AS r ON r.id = i.revision_id
WHERE i.revision_id = (SELECT revision_id FROM c33);
SELECT throws_ok(
  format($$SELECT public.editar_ruteo_item(%L, %L::jsonb, %L)$$,
    (SELECT item_id FROM c33_ruteo),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en FROM c33_ruteo), 'filas', jsonb_build_array(
      jsonb_build_object('proceso_id', (SELECT proceso_id FROM c33_ruteo),
        'grupo_equipo_id', '00000000-0000-4000-8000-0000000c3310',
        'recurso_id', '00000000-0000-4000-8000-0000000c3313', 'setup_horas', 1, 'run_horas', 1))),
    '00000000-0000-4000-8000-0000000c3301'),
  '22023', 'recurso_grupo_distinto', 'la máquina debe pertenecer al grupo del renglón');
SELECT lives_ok(
  format($$SELECT public.editar_ruteo_item(%L, %L::jsonb, %L)$$,
    (SELECT item_id FROM c33_ruteo),
    jsonb_build_object('actualizado_en', (SELECT actualizado_en FROM c33_ruteo), 'filas', jsonb_build_array(
      jsonb_build_object('proceso_id', (SELECT proceso_id FROM c33_ruteo),
        'grupo_equipo_id', '00000000-0000-4000-8000-0000000c3310',
        'recurso_id', '00000000-0000-4000-8000-0000000c3311', 'setup_horas', 1, 'run_horas', 1))),
    '00000000-0000-4000-8000-0000000c3301'),
  'guarda la máquina del mismo grupo en el renglón');

-- 16. Privilegios
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.costear_ruteo_revision(uuid, uuid, uuid)', 'EXECUTE'),
  'authenticated no ejecuta el costeo');

SELECT * FROM finish();
ROLLBACK;
