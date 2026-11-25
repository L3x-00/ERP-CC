-- Egreso vinculado a material: la compra fija el costo unitario del catálogo
-- para el futuro, sin tocar consumos ni cotizaciones ya registradas.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-0000000e2401', 'e24-contador@prueba.local');
UPDATE public.usuarios SET rol = 'contador', activo = true
WHERE id = '00000000-0000-4000-8000-0000000e2401';

INSERT INTO public.catalogo_materiales (id, codigo, nombre, unidad_base)
VALUES ('00000000-0000-4000-8000-0000000e2410', 'E24ACERO', 'Acero E24', 'kg');

CREATE TEMP TABLE e24 ON COMMIT DROP AS
SELECT jsonb_build_object(
  'categoria', 'materia_prima', 'descripcion', 'Compra de material E24',
  'tipoGasto', 'variable', 'montoSubtotal', 1000, 'montoIva', 160,
  'montoTotal', 1160, 'moneda', 'MXN', 'tipoCambio', 1,
  'fechaGasto', current_date::text,
  'materialId', '00000000-0000-4000-8000-0000000e2410'::text,
  'cantidadMaterial', 2
) AS datos;

SELECT lives_ok(format(
  'SELECT * FROM public.registrar_gasto_a19(%L, %L)',
  (SELECT datos FROM e24), '00000000-0000-4000-8000-0000000e2401'::uuid
), 'El contador registra el egreso vinculado a material');

SELECT is((SELECT costo_vigente FROM public.catalogo_materiales
  WHERE id = '00000000-0000-4000-8000-0000000e2410'), 500::numeric,
  'El costo unitario es subtotal sin IVA entre la cantidad comprada');
SELECT is((SELECT cantidad_material FROM public.gastos
  WHERE material_id = '00000000-0000-4000-8000-0000000e2410'), 2::numeric,
  'El gasto conserva la cantidad comprada');
SELECT is((SELECT costo_unitario_material FROM public.gastos
  WHERE material_id = '00000000-0000-4000-8000-0000000e2410'), 500::numeric,
  'El gasto conserva el unitario calculado');
SELECT is((SELECT count(*)::integer FROM public.historial_costos_material
  WHERE material_id = '00000000-0000-4000-8000-0000000e2410'
    AND fuente = 'GASTO'), 1,
  'La confirmación escribe el historial append-only');

SELECT throws_like(format(
  'SELECT * FROM public.registrar_gasto_a19(%L, %L)',
  (SELECT datos FROM e24) || jsonb_build_object('moneda', 'USD', 'tipoCambio', 17),
  '00000000-0000-4000-8000-0000000e2401'::uuid
), 'moneda_gasto_material_distinta%',
  'La moneda distinta se rechaza con el mensaje y la salida real');

SELECT * FROM finish();
ROLLBACK;
