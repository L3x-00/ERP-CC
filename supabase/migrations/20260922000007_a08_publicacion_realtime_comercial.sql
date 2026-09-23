-- =============================================================================
-- A08 — Reconciliación de la publicación `supabase_realtime` con las vistas
-- que realmente la consumen.
--
-- Hallazgo: el catálogo local publicaba 25 tablas y no incluía `clientes`,
-- `pipeline`, `cotizacion_lineas` ni `operadores_areas`. El sincronizador del
-- dashboard ya escuchaba `pipeline` y `cotizacion_lineas` (canal abierto que
-- nunca emite) y Configuración no tenía consumidor de `operadores_areas`.
--
-- Esta migración es aditiva e idempotente: solo agrega a la publicación las
-- tablas que faltan y no toca RLS, grants ni `REPLICA IDENTITY`.
--
-- Decisión deliberada: NO se activa `REPLICA IDENTITY FULL`. Con la identidad
-- por defecto, el `old_record` de un DELETE solo contiene la clave primaria, y
-- todos los suscriptores de la aplicación invalidan y releen por consulta
-- autorizada en vez de pintar el payload. Poner FULL publicaría cada columna
-- anterior (precios, contactos, datos de cliente) en el WAL replicado sin
-- ninguna necesidad funcional.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Alta idempotente en la publicación.
--    La lista incluye tanto lo que faltaba (A07/A08) como las fuentes que ya
--    alimentan dashboard y configuración, para que el estado quede verificado
--    y no solo "agregado" en una instalación migrada a medias.
-- -----------------------------------------------------------------------------
DO $a08$
DECLARE
  v_tabla text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE EXCEPTION
      'A08: no existe la publicación supabase_realtime; revisar la instalación de Realtime antes de continuar';
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY[
    -- Faltantes detectadas por la auditoría (A07/A08).
    'clientes',
    'pipeline',
    'cotizacion_lineas',
    'operadores_areas',
    -- Ya publicadas; se verifican para detectar instalaciones incompletas.
    'contactos_cliente',
    'ordenes_produccion',
    'partidas_orden_produccion',
    'cuentas_por_cobrar',
    'pagos_ar',
    'gastos',
    'sesiones_trabajo',
    'registros_consumo_material',
    'metas_vendedor',
    'configuracion_sistema',
    'cuentas_bancarias',
    'areas_trabajo_config'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(v_tabla)) IS NULL THEN
      RAISE EXCEPTION 'A08: la tabla public.% no existe; falta aplicar una migración previa', v_tabla;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tabla);
    END IF;
  END LOOP;
END;
$a08$;

-- -----------------------------------------------------------------------------
-- 2. Control de `REPLICA IDENTITY` de las tablas comerciales recién publicadas.
--    No se modifica nada (cambiarla es una decisión de replicación, no de esta
--    corrección); si alguien la dejó en FULL, el aviso queda en el log de
--    aplicación para que se revise antes de dar por buena la publicación.
-- -----------------------------------------------------------------------------
DO $a08_identidad$
DECLARE
  v_tabla text;
  v_identidad char;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'clientes', 'contactos_cliente', 'pipeline', 'cotizacion_lineas', 'operadores_areas'
  ]
  LOOP
    SELECT relreplident INTO v_identidad
    FROM pg_class
    WHERE oid = ('public.' || quote_ident(v_tabla))::regclass;

    IF v_identidad = 'f' THEN
      RAISE WARNING
        'A08: public.% tiene REPLICA IDENTITY FULL; publica cada columna anterior en los eventos DELETE/UPDATE. Revisar si es intencional.',
        v_tabla;
    END IF;
  END LOOP;
END;
$a08_identidad$;

COMMENT ON TABLE public.operadores_areas IS
  'OBS-09/PRD-11: áreas/subáreas/procesos que un operador puede atender. Sin filas = sin restricción (transición). Publicada en supabase_realtime (A08) para que Configuración se sincronice entre sesiones.';
