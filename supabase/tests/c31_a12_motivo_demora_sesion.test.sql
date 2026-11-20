-- C31/A12: motivo de la demora sobre el tiempo estimado.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000c31a1201', 'c31a12-op@prueba.local'),
  ('00000000-0000-4000-8000-0000c31a1202', 'c31a12-op2@prueba.local');
UPDATE public.usuarios SET rol='operador', activo=true, nombre_completo='Operador A12'
WHERE id='00000000-0000-4000-8000-0000c31a1201';
UPDATE public.usuarios SET rol='operador', activo=true, nombre_completo='Operador A12 B'
WHERE id='00000000-0000-4000-8000-0000c31a1202';

INSERT INTO public.clientes (id, razon_social, nombre_comercial, estado)
VALUES ('00000000-0000-4000-8000-0000c31a1203','Cliente A12 SA','Cliente A12','activo');
INSERT INTO public.ordenes_produccion (id, folio, cliente_id, estado, fecha_compromiso)
VALUES ('00000000-0000-4000-8000-0000c31a1204','OP-994511','00000000-0000-4000-8000-0000c31a1203','en_proceso',current_date+1);
INSERT INTO public.partidas_orden_produccion (id, orden_id, codigo_pieza, cantidad_solicitada, unidad_medida, procesos, operador_asignado_id)
VALUES ('00000000-0000-4000-8000-0000c31a1205','00000000-0000-4000-8000-0000c31a1204','A12-01',10,'pieza',ARRAY['LASER_FIBRA'],'00000000-0000-4000-8000-0000c31a1201');
INSERT INTO public.recursos_planeacion (id, codigo, nombre, area, activo)
VALUES ('00000000-0000-4000-8000-0000c31a1208','A12-R1','Recurso A12','taller',true);
INSERT INTO public.programacion_areas (id, orden_id, partida_id, recurso_id, secuencia, estado_planeacion, fecha_programada, turno, horas_estimadas)
VALUES ('00000000-0000-4000-8000-0000c31a1206','00000000-0000-4000-8000-0000c31a1204','00000000-0000-4000-8000-0000c31a1205','00000000-0000-4000-8000-0000c31a1208',1,'en_proceso',current_date,'matutino',1.5);
INSERT INTO public.sesiones_trabajo (id, orden_id, partida_id, programacion_id, operador_id, fecha_inicio)
VALUES ('00000000-0000-4000-8000-0000c31a1207','00000000-0000-4000-8000-0000c31a1204','00000000-0000-4000-8000-0000c31a1205','00000000-0000-4000-8000-0000c31a1206','00000000-0000-4000-8000-0000c31a1201',now() - interval '3 hours');

SELECT ok(has_function_privilege('service_role','public.registrar_motivo_exceso_sesion(uuid,uuid,text,text)','EXECUTE'),
  'service_role puede registrar el motivo');
SELECT ok(NOT has_function_privilege('authenticated','public.registrar_motivo_exceso_sesion(uuid,uuid,text,text)','EXECUTE'),
  'authenticated no puede invocar la RPC');

SELECT lives_ok($$SELECT public.registrar_motivo_exceso_sesion(
  '00000000-0000-4000-8000-0000c31a1207','00000000-0000-4000-8000-0000c31a1201',
  'OLVIDE_CERRAR','Hora real declarada: 2026-11-20 12:10')$$,
  'Se registra el motivo por olvido');

SELECT is((SELECT motivo_exceso FROM public.sesiones_trabajo WHERE id='00000000-0000-4000-8000-0000c31a1207'),
  'OLVIDE_CERRAR','El motivo queda persistido');
SELECT ok((SELECT motivo_exceso_detalle FROM public.sesiones_trabajo WHERE id='00000000-0000-4000-8000-0000c31a1207') LIKE 'Hora real declarada%',
  'El detalle guarda la hora corregida');

SELECT is((SELECT jsonb->>'ya_aplicado' FROM (
  SELECT public.registrar_motivo_exceso_sesion(
    '00000000-0000-4000-8000-0000c31a1207','00000000-0000-4000-8000-0000c31a1201',
    'OLVIDE_CERRAR','Hora real declarada: 2026-11-20 12:10') AS jsonb) AS t), 'true',
  'La segunda llamada con el mismo motivo es idempotente');

SELECT throws_ok($$SELECT public.registrar_motivo_exceso_sesion(
  '00000000-0000-4000-8000-0000c31a1207','00000000-0000-4000-8000-0000c31a1202',
  'OTRO','Motivo de prueba')$$, '23514','sesion_no_activa',
  'Otro operador no puede cambiar el motivo');

SELECT throws_ok($$SELECT public.registrar_motivo_exceso_sesion(
  '00000000-0000-4000-8000-0000c31a1207','00000000-0000-4000-8000-0000c31a1201',
  'OTRO','x')$$, '23514','motivo_exceso_invalido',
  'El detalle demasiado corto se rechaza');

SELECT * FROM finish();
ROLLBACK;
