-- =============================================================================
-- Migración: expandir tabla clientes (Fase 3 — Módulo de Clientes)
-- ORCA MFG ERP. Idempotente.
--
-- Parte de la tabla `clientes` MÍNIMA de Fase 2 (nombre_comercial, rfc, contacto,
-- correo, telefono) y la lleva a la ficha 360°: razón social, tiers automáticos
-- y manuales con caducidad, límite de crédito, saldo a favor, direcciones
-- (fiscal/envío) y estado. Agrega `documentos_cliente` + bucket de Storage.
--
-- Modelo de seguridad (consistente con el endurecimiento de Fase 2,
-- migración 20260706000006): las MUTACIONES pasan por Server Actions con cliente
-- admin (service_role, que bypasa RLS) y verifican `can()` en el servidor. Por
-- eso NO se crean políticas de INSERT/UPDATE/DELETE para `authenticated` — abrir
-- escritura directa por PostgREST saltaría la lógica de tiers/crédito/auditoría.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas nuevas (idempotentes con IF NOT EXISTS).
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS razon_social      text,
  ADD COLUMN IF NOT EXISTS condiciones_pago  text,
  ADD COLUMN IF NOT EXISTS limite_credito    numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_a_favor     numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier              text NOT NULL DEFAULT 'bronce',
  ADD COLUMN IF NOT EXISTS tier_manual       text,
  ADD COLUMN IF NOT EXISTS tier_manual_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS estado            text NOT NULL DEFAULT 'prospecto',
  ADD COLUMN IF NOT EXISTS direccion_fiscal  jsonb,
  ADD COLUMN IF NOT EXISTS direccion_envio   jsonb;

-- Backfill: la razón social es obligatoria en Fase 3. Las filas heredadas de
-- Fase 2 no la tienen, así que se siembra desde el nombre comercial (NOT NULL).
UPDATE public.clientes
  SET razon_social = nombre_comercial
  WHERE razon_social IS NULL;

ALTER TABLE public.clientes
  ALTER COLUMN razon_social SET NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. CHECK constraints (idempotentes: se sueltan y recrean).
-- -----------------------------------------------------------------------------
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tier_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tier_check
  CHECK (tier IN ('bronce', 'plata', 'oro', 'platino'));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tier_manual_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tier_manual_check
  CHECK (tier_manual IS NULL OR tier_manual IN ('bronce', 'plata', 'oro', 'platino'));

-- El tier manual y su caducidad viajan juntos: o ambos existen o ninguno.
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_tier_manual_coherente;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_tier_manual_coherente
  CHECK ((tier_manual IS NULL) = (tier_manual_hasta IS NULL));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_estado_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_estado_check
  CHECK (estado IN ('prospecto', 'activo', 'inactivo'));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_condiciones_pago_check;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_condiciones_pago_check
  CHECK (condiciones_pago IS NULL
         OR condiciones_pago IN ('contado', '15_dias', '30_dias', 'credito'));

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS clientes_credito_no_negativo;
ALTER TABLE public.clientes
  ADD CONSTRAINT clientes_credito_no_negativo
  CHECK (limite_credito >= 0 AND saldo_a_favor >= 0);

COMMENT ON COLUMN public.clientes.tier IS
  'Tier base derivado del consumo (bronce/plata/oro/platino). El tier EFECTIVO lo resuelve calcular-tier.ts: tier_manual manda mientras tier_manual_hasta no venza.';
COMMENT ON COLUMN public.clientes.saldo_a_favor IS
  'Crédito a favor del cliente (anticipos/notas). Suma al crédito disponible. AR real llega en Fase 8.';

-- -----------------------------------------------------------------------------
-- 3. Deduplicación por razón social (case-insensitive), complementa el índice
--    único ux_clientes_correo (Fase 2) y el UNIQUE de rfc. Evita registros
--    duplicados al crear o al promover desde el pipeline.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_razon_social
  ON public.clientes (lower(razon_social));

CREATE INDEX IF NOT EXISTS idx_clientes_estado ON public.clientes (estado);
CREATE INDEX IF NOT EXISTS idx_clientes_tier   ON public.clientes (tier);

-- -----------------------------------------------------------------------------
-- 4. RLS de clientes: SELECT deja de ser abierto (los datos ahora incluyen
--    límites de crédito y direcciones fiscales). Se restringe a admin o a quien
--    tenga el permiso `ver_clientes` (admin, gerente, vendedor por seed).
--    Sin políticas de escritura: las mutaciones corren en Server Actions
--    privilegiadas (service_role) que verifican `can()`.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS clientes_seleccionar ON public.clientes;
CREATE POLICY clientes_seleccionar
  ON public.clientes
  FOR SELECT
  TO authenticated
  USING (public.es_admin() OR public.usuario_tiene_permiso('ver_clientes'));

-- -----------------------------------------------------------------------------
-- 5. Tabla documentos_cliente: metadatos de archivos en Storage (CSF, contratos,
--    etc.). El binario vive en el bucket `documentos-cliente` bajo la ruta
--    '<cliente_id>/<archivo>'. ON DELETE CASCADE: borrar el cliente borra sus
--    referencias (la limpieza del binario la hace la acción de servidor).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documentos_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes (id) ON DELETE CASCADE,
  tipo text NOT NULL
    CHECK (tipo IN ('csf', 'contrato', 'identificacion', 'comprobante_domicilio', 'otro')),
  nombre_archivo text NOT NULL,
  ruta_storage text NOT NULL UNIQUE,
  subido_por uuid REFERENCES public.usuarios (id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.documentos_cliente IS
  'Metadatos de documentos del cliente en Storage (bucket documentos-cliente). Binario en <cliente_id>/<archivo>.';

CREATE INDEX IF NOT EXISTS idx_documentos_cliente_cliente
  ON public.documentos_cliente (cliente_id);

ALTER TABLE public.documentos_cliente ENABLE ROW LEVEL SECURITY;

-- SELECT: mismo alcance que ver un cliente. Escritura solo vía Server Action.
DROP POLICY IF EXISTS documentos_cliente_seleccionar ON public.documentos_cliente;
CREATE POLICY documentos_cliente_seleccionar
  ON public.documentos_cliente
  FOR SELECT
  TO authenticated
  USING (public.es_admin() OR public.usuario_tiene_permiso('ver_clientes'));

-- -----------------------------------------------------------------------------
-- 6. Bucket de Storage privado para documentos del cliente + RLS.
--    Ruta '<cliente_id>/<archivo>'. Lectura/subida: ver_clientes o admin.
--    Borrado: permiso `eliminar` o admin. Los documentos fiscales (CSF) y
--    contratos son sensibles: bucket NO público.
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-cliente', 'documentos-cliente', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documentos_cliente_storage_seleccionar ON storage.objects;
CREATE POLICY documentos_cliente_storage_seleccionar
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documentos-cliente'
    AND (public.es_admin() OR public.usuario_tiene_permiso('ver_clientes'))
  );

DROP POLICY IF EXISTS documentos_cliente_storage_insertar ON storage.objects;
CREATE POLICY documentos_cliente_storage_insertar
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-cliente'
    AND (public.es_admin() OR public.usuario_tiene_permiso('ver_clientes'))
  );

DROP POLICY IF EXISTS documentos_cliente_storage_eliminar ON storage.objects;
CREATE POLICY documentos_cliente_storage_eliminar
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos-cliente'
    AND (public.es_admin() OR public.usuario_tiene_permiso('eliminar'))
  );
