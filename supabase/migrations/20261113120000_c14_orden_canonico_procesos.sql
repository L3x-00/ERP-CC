-- C14 (2026-11-13): el orden de las operaciones solicitadas sigue la secuencia
-- técnica del taller, no el orden en que se marcaron las casillas del RFQ.
--
-- Regla del cliente: primero Corte (láser/router), después Doblado y luego el
-- resto de la cadena (soldadura → maquinado → acabado → ensamble). El catálogo
-- `catalogo_procesos.orden` desempata dentro de la misma familia.
--
-- Causa raíz del reporte: `rfq_item_operaciones.orden` se llenaba con el orden
-- de selección de la UI (`[...previo.procesoIds, procesoId]`). Al convertir el
-- RFQ en propuesta, ese orden se copiaba a `propuesta_item_ruteo.secuencia` y
-- de ahí al snapshot y a las metas de la partida; Mi panel del operador mostraba
-- DOBLADO_CNC como secuencia 1 y bloqueaba Corte láser.
--
-- Alcance de la corrección:
--   1. Normaliza el orden en las altas y bajas de `rfq_item_operaciones`
--      (crear, editar, reemplazar o backfill) mediante un trigger.
--   2. Sanea los RFQ ya capturados con el orden invertido.
--   3. Sanea el ruteo inicial de las revisiones DRAFT que aún no se congelaron
--      y que quedaron invertidas.
--   4. Ordena al alta los procesos de una partida de orden interna (sin cliente),
--      de donde nacen las metas que ve el operador.
-- No reescribe órdenes ya creadas/en proceso: su snapshot y sus metas están
-- congelados y pueden tener avance o reclamaciones. Esas órdenes conservan su
-- historial; las nuevas nacen con la secuencia correcta.

-- -----------------------------------------------------------------------------
-- 1. Rango canónico por familia de proceso (mismo criterio que
--    `familiaProceso` del módulo de producción).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.rango_proceso_canonico(p_codigo text, p_nombre text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN normalizado.texto LIKE '%dob%' THEN 20
    WHEN normalizado.texto LIKE '%laser%'
      OR normalizado.texto LIKE '%corte%'
      OR normalizado.texto LIKE '%router%' THEN 10
    WHEN normalizado.texto LIKE '%soldad%' THEN 30
    WHEN normalizado.texto LIKE '%maquinad%'
      OR normalizado.texto LIKE '%fabrica%' THEN 40
    WHEN normalizado.texto LIKE '%acab%' THEN 50
    WHEN normalizado.texto LIKE '%ensambl%' THEN 60
    ELSE 70
  END
  FROM (
    SELECT translate(
             lower(btrim(coalesce(p_nombre, '') || ' ' || coalesce(p_codigo, ''))),
             'áàäâéèëêíìïîóòöôúùüûñç',
             'aaaaeeeeiiiioooouuuunc'
           ) AS texto
  ) AS normalizado;
$$;

COMMENT ON FUNCTION privado.rango_proceso_canonico(text, text) IS
  'C14: familia técnica del proceso (corte 10, doblado 20, soldadura 30, maquinado 40, acabado 50, ensamble 60, otro 70).';

REVOKE ALL ON FUNCTION privado.rango_proceso_canonico(text, text)
  FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Renumeración canónica de las operaciones de un ítem RFQ.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.normalizar_orden_operaciones_rfq(p_item_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ordenadas AS (
    SELECT operacion.proceso_id,
           (row_number() OVER (
              ORDER BY privado.rango_proceso_canonico(proceso.codigo, proceso.nombre),
                       proceso.orden,
                       proceso.codigo,
                       proceso.id
           ) - 1)::integer AS nuevo_orden
    FROM public.rfq_item_operaciones AS operacion
    JOIN public.catalogo_procesos AS proceso ON proceso.id = operacion.proceso_id
    WHERE operacion.rfq_item_id = p_item_id
  )
  UPDATE public.rfq_item_operaciones AS operacion
  SET orden = ordenada.nuevo_orden
  FROM ordenadas AS ordenada
  WHERE operacion.rfq_item_id = p_item_id
    AND operacion.proceso_id = ordenada.proceso_id
    AND operacion.orden IS DISTINCT FROM ordenada.nuevo_orden;
$$;

COMMENT ON FUNCTION privado.normalizar_orden_operaciones_rfq(uuid) IS
  'C14: renumera las operaciones de un ítem RFQ en la secuencia técnica del taller.';

REVOKE ALL ON FUNCTION privado.normalizar_orden_operaciones_rfq(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION privado.normalizar_orden_operaciones_rfq_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Solo alta y baja: las RPC de RFQ (crear/editar/reemplazar) siempre
  -- reemplazan el conjunto con DELETE + INSERT, y así la renumeración no
  -- compite con una sentencia UPDATE que aún esté recorriendo las mismas filas.
  PERFORM privado.normalizar_orden_operaciones_rfq(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.rfq_item_id ELSE NEW.rfq_item_id END
  );

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION privado.normalizar_orden_operaciones_rfq_trigger() IS
  'C14: mantiene el orden canónico al alta o baja de operaciones RFQ.';

REVOKE ALL ON FUNCTION privado.normalizar_orden_operaciones_rfq_trigger()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_orden_canonico_operaciones_rfq
  ON public.rfq_item_operaciones;
CREATE TRIGGER trigger_orden_canonico_operaciones_rfq
  AFTER INSERT OR DELETE ON public.rfq_item_operaciones
  FOR EACH ROW EXECUTE FUNCTION privado.normalizar_orden_operaciones_rfq_trigger();

-- -----------------------------------------------------------------------------
-- 3. Saneamiento de RFQ ya capturados (el trigger cubre las escrituras nuevas).
--    Un RFQ congelado (ya generó una revisión A) es historial inmutable: la base
--    lo protege con `privado.rfq_congelado` y su orden ya no alimenta órdenes
--    nuevas, así que se omite en lugar de romper la migración.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_item_id uuid;
BEGIN
  FOR v_item_id IN
    SELECT DISTINCT operacion.rfq_item_id
    FROM public.rfq_item_operaciones AS operacion
    JOIN public.rfq_items AS item ON item.id = operacion.rfq_item_id
    WHERE NOT privado.rfq_congelado(item.rfq_id)
  LOOP
    PERFORM privado.normalizar_orden_operaciones_rfq(v_item_id);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Ruteo inicial de propuestas DRAFT que nació invertido.
--    Solo se tocan revisiones editables con al menos una inversión de familia;
--    las revisiones enviadas/aceptadas y los snapshots de órdenes no se alteran.
--    La función es idempotente y queda disponible para pruebas y reparaciones.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.normalizar_ruteo_propuestas_draft()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_items uuid[];
  v_offset integer;
  v_total integer := 0;
BEGIN
  WITH ruteo_con_rango AS (
    SELECT ruteo.item_id,
           privado.rango_proceso_canonico(proceso.codigo, proceso.nombre) AS rango,
           lag(privado.rango_proceso_canonico(proceso.codigo, proceso.nombre))
             OVER (PARTITION BY ruteo.item_id ORDER BY ruteo.secuencia, ruteo.id) AS rango_previo
    FROM public.propuesta_item_ruteo AS ruteo
    JOIN public.propuesta_items AS item ON item.id = ruteo.item_id
    JOIN public.propuesta_revisiones AS revision ON revision.id = item.revision_id
    JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE revision.estado = 'DRAFT'
  )
  SELECT array_agg(DISTINCT item_id) INTO v_items
  FROM ruteo_con_rango
  WHERE rango_previo IS NOT NULL
    AND rango < rango_previo;

  IF v_items IS NULL THEN
    RETURN 0;
  END IF;

  -- `(item_id, secuencia)` es único: se desplaza primero por encima del máximo
  -- global para renumerar después sin chocar contra filas aún sin mover.
  SELECT coalesce(max(secuencia), 0) + 1 INTO v_offset
  FROM public.propuesta_item_ruteo;

  UPDATE public.propuesta_item_ruteo
  SET secuencia = secuencia + v_offset
  WHERE item_id = ANY(v_items);

  WITH ruteo_ordenado AS (
    SELECT ruteo.id AS ruteo_id,
           row_number() OVER (
             PARTITION BY ruteo.item_id
             ORDER BY privado.rango_proceso_canonico(proceso.codigo, proceso.nombre),
                      ruteo.secuencia,
                      ruteo.id
           )::integer AS nueva_secuencia
    FROM public.propuesta_item_ruteo AS ruteo
    JOIN public.catalogo_procesos AS proceso ON proceso.id = ruteo.proceso_id
    WHERE ruteo.item_id = ANY(v_items)
  )
  UPDATE public.propuesta_item_ruteo AS ruteo
  SET secuencia = ordenado.nueva_secuencia
  FROM ruteo_ordenado AS ordenado
  WHERE ruteo.id = ordenado.ruteo_id;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION privado.normalizar_ruteo_propuestas_draft() IS
  'C14: renumera el ruteo de revisiones DRAFT con inversión de familias; no toca revisiones congeladas.';

REVOKE ALL ON FUNCTION privado.normalizar_ruteo_propuestas_draft()
  FROM PUBLIC, anon, authenticated;

SELECT privado.normalizar_ruteo_propuestas_draft();

-- -----------------------------------------------------------------------------
-- 5. Órdenes internas (sin cliente): `partidas_orden_produccion.procesos` llega
--    con el orden de captura y de ahí nacen las metas del operador. Se ordena en
--    el alta para que Mi panel muestre primero el corte. No se reescriben
--    partidas existentes: sus metas ya pueden tener avance o reclamaciones.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION privado.ordenar_procesos_canonicos(p_procesos text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    array_agg(
      proceso.nombre
      ORDER BY privado.rango_proceso_canonico(NULL, proceso.nombre), proceso.pos
    ),
    '{}'::text[]
  )
  FROM unnest(p_procesos) WITH ORDINALITY AS proceso(nombre, pos)
  WHERE proceso.nombre IS NOT NULL;
$$;

COMMENT ON FUNCTION privado.ordenar_procesos_canonicos(text[]) IS
  'C14: ordena nombres de proceso por familia técnica y conserva el orden de captura dentro de la misma.';

REVOKE ALL ON FUNCTION privado.ordenar_procesos_canonicos(text[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION privado.normalizar_procesos_partida_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.procesos := privado.ordenar_procesos_canonicos(NEW.procesos);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION privado.normalizar_procesos_partida_trigger() IS
  'C14: el alta de una partida hereda la secuencia técnica, no el orden de captura.';

REVOKE ALL ON FUNCTION privado.normalizar_procesos_partida_trigger()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_orden_canonico_procesos_partida
  ON public.partidas_orden_produccion;
CREATE TRIGGER trigger_orden_canonico_procesos_partida
  BEFORE INSERT ON public.partidas_orden_produccion
  FOR EACH ROW EXECUTE FUNCTION privado.normalizar_procesos_partida_trigger();
