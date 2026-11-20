-- C31/A11: el cierre se bloquea hasta liberar la primera pieza y se reanuda solo.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000c31a1101', 'c31a11-op@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a1102', 'c31a11-admin@prueba.local');
UPDATE public.usuarios SET rol='operador', activo=true, nombre_completo='Operador A11'
WHERE id='00000000-0000-4000-8000-0000c31a1101';
UPDATE public.usuarios SET rol='admin', activo=true, nombre_completo='Admin A11'
WHERE id='00000000-0000-4000-8000-0000c31a1102';

INSERT INTO public.materiales (id, codigo, nombre, categoria, unidad_compra, unidad_control, factor_conversion,
  costo_unitario_compra, costo_unitario_control, stock_actual_control, stock_minimo_control)
VALUES ('00000000-0000-4000-8000-0000c31a1103','A11LEG','Acero A11','materia_prima','pieza','pieza',1,10,10,100,1);
INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base, material_legacy_id)
VALUES ('00000000-0000-4000-8000-0000c31a1104','A11MAT','Acero al carbon A11','pieza','00000000-0000-4000-8000-0000c31a1103');
SELECT public.confirmar_costo_material('00000000-0000-4000-8000-0000c31a1104',10,'MXN',current_date,'MANUAL',NULL,
  '00000000-0000-4000-8000-0000c31a1102',
  (SELECT actualizado_en FROM public.catalogo_materiales WHERE id='00000000-0000-4000-8000-0000c31a1104'), NULL);

UPDATE public.catalogo_procesos SET requiere_primera_pieza = true WHERE codigo = 'LASER_FIBRA';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000c31a1105','Cliente A11 SA','Cliente A11','activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000c31a1106','OP-994411','00000000-0000-4000-8000-0000c31a1105','en_proceso',current_date+1);
INSERT INTO public.partidas_orden_produccion (id, orden_id, codigo_pieza, descripcion, cantidad_solicitada, unidad_medida,
  catalogo_material_id, operador_asignado_id, procesos)
VALUES ('00000000-0000-4000-8000-0000c31a1107','00000000-0000-4000-8000-0000c31a1106','IT02','Soporte',
  200,'unidad','00000000-0000-4000-8000-0000c31a1104','00000000-0000-4000-8000-0000c31a1101',ARRAY['LASER_FIBRA','DOB']);

INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000c31a1108','A11-R1','Laser A11','taller',true);
INSERT INTO public.capacidades_recurso_turno (recurso_id, turno, horas_capacidad)
VALUES ('00000000-0000-4000-8000-0000c31a1108','matutino',8);
INSERT INTO public.programacion_areas (id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion,
  fecha_programada, turno, horas_estimadas, meta_proceso_id)
VALUES
 ('00000000-0000-4000-8000-0000c31a1109','00000000-0000-4000-8000-0000c31a1106','00000000-0000-4000-8000-0000c31a1107',
  '00000000-0000-4000-8000-0000c31a1108',1,'en_proceso',current_date,'matutino',1.5,
  (SELECT id FROM metas_proceso_partida WHERE partida_id='00000000-0000-4000-8000-0000c31a1107' AND secuencia=1)),
 ('00000000-0000-4000-8000-0000c31a110a','00000000-0000-4000-8000-0000c31a1106','00000000-0000-4000-8000-0000c31a1107',
  '00000000-0000-4000-8000-0000c31a1108',2,'programada',current_date,'matutino',1.5,
  (SELECT id FROM metas_proceso_partida WHERE partida_id='00000000-0000-4000-8000-0000c31a1107' AND secuencia=2));

INSERT INTO public.corridas (id, orden_id, codigo, proceso_id, estado, cantidad_planificada, creado_por)
VALUES ('00000000-0000-4000-8000-0000c31a110b','00000000-0000-4000-8000-0000c31a1106','LAS011',
  (SELECT id FROM catalogo_procesos WHERE codigo='LASER_FIBRA'),'EN_PROCESO',200,
  '00000000-0000-4000-8000-0000c31a1101');
INSERT INTO public.corrida_items (corrida_id, partida_id, codigo_item, cantidad)
VALUES ('00000000-0000-4000-8000-0000c31a110b','00000000-0000-4000-8000-0000c31a1107','IT02',200);
INSERT INTO public.sesiones_trabajo (id, orden_id, partida_id, programacion_id, operador_id, corrida_id, fecha_inicio)
VALUES ('00000000-0000-4000-8000-0000c31a110c','00000000-0000-4000-8000-0000c31a1106','00000000-0000-4000-8000-0000c31a1107',
  '00000000-0000-4000-8000-0000c31a1109','00000000-0000-4000-8000-0000c31a1101','00000000-0000-4000-8000-0000c31a110b',
  now() - interval '2 hours 45 minutes');

SELECT lives_ok($$SELECT public.registrar_hora_fin_sesion(
  '00000000-0000-4000-8000-0000c31a110c','00000000-0000-4000-8000-0000c31a1101', now() - interval '1 second')$$,
  'Se registra la hora real de conclusion');

SELECT throws_ok($$SELECT * FROM public.cerrar_sesion_con_consumo_operador(
  '00000000-0000-4000-8000-0000c31a110c','00000000-0000-4000-8000-0000c31a1101',200,
  '00000000-0000-4000-8000-0000c31a1104',0.80,0.20,'para el corte laser',
  (SELECT id FROM metas_proceso_partida WHERE partida_id='00000000-0000-4000-8000-0000c31a1107' AND secuencia=1),NULL)$$,
  '23514','primera_pieza_pendiente',
  'El cierre se bloquea porque la corrida exige primera pieza');

SELECT is((SELECT estado_sesion FROM public.sesiones_trabajo
  WHERE id='00000000-0000-4000-8000-0000c31a110c'), 'activa',
  'El rechazo no cierra la sesion ni pierde la captura');

SELECT lives_ok($$SELECT public.registrar_inspeccion(
  '00000000-0000-4000-8000-0000c31a1106','00000000-0000-4000-8000-0000c31a110b',
  '00000000-0000-4000-8000-0000c31a1107','IT02','PRIMERA_PIEZA',1,'APROBADA','{}'::jsonb,
  1,1,0,0,'[]'::jsonb,'Primera pieza conforme','00000000-0000-4000-8000-0000c31a1101',NULL)$$,
  'Se libera la primera pieza aprobada');

SELECT lives_ok($$SELECT * FROM public.cerrar_sesion_con_consumo_operador(
  '00000000-0000-4000-8000-0000c31a110c','00000000-0000-4000-8000-0000c31a1101',200,
  '00000000-0000-4000-8000-0000c31a1104',0.80,0.20,'para el corte laser',
  (SELECT id FROM metas_proceso_partida WHERE partida_id='00000000-0000-4000-8000-0000c31a1107' AND secuencia=1),NULL)$$,
  'Con la primera pieza aprobada el cierre se reintenta y termina');

SELECT * FROM finish();
ROLLBACK;
