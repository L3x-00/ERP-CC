-- =============================================================================
-- Migración: rate-limiting de intentos de login (PIN de operador y email/password)
-- Fase 1 — Autenticación + Permisos + Auditoría (ORCA MFG ERP)
-- Idempotente: puede ejecutarse múltiples veces sin efectos secundarios.
--
-- Sin esto, el PIN de operador (4-6 dígitos) es fuerza-bruteable sin fricción:
-- ninguna Server Action distinguía el intento #1 del intento #10,000. El
-- contador se mantiene por identificador (IP del solicitante) + contexto
-- ('pin' | 'password'), no por usuario — el PIN identifica al operador, no
-- hay "usuario" que bloquear hasta que el PIN ya hizo match.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.intentos_login (
  identificador text NOT NULL,
  contexto text NOT NULL CHECK (contexto IN ('pin', 'password')),
  intentos integer NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (identificador, contexto)
);

COMMENT ON TABLE public.intentos_login IS 'Contador de intentos fallidos de login por IP, para rate-limiting. Solo accedido por service role (no hay sesión aún cuando se consulta).';

ALTER TABLE public.intentos_login ENABLE ROW LEVEL SECURITY;
-- Sin políticas: acceso exclusivo vía service role (cliente admin).

-- -----------------------------------------------------------------------------
-- Función registrar_intento_fallido: incrementa y evalúa bloqueo de forma
-- atómica (evita condición de carrera entre leer el contador y escribirlo
-- bajo intentos concurrentes del mismo atacante).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_intento_fallido(
  p_identificador text,
  p_contexto text,
  p_max_intentos integer,
  p_bloqueo_segundos integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.intentos_login (identificador, contexto, intentos, bloqueado_hasta, actualizado_en)
  VALUES (p_identificador, p_contexto, 1, NULL, now())
  ON CONFLICT (identificador, contexto) DO UPDATE
  SET intentos = public.intentos_login.intentos + 1,
      bloqueado_hasta = CASE
        WHEN public.intentos_login.intentos + 1 >= p_max_intentos
          THEN now() + make_interval(secs => p_bloqueo_segundos)
        ELSE public.intentos_login.bloqueado_hasta
      END,
      actualizado_en = now();
END;
$$;

COMMENT ON FUNCTION public.registrar_intento_fallido IS 'Incrementa el contador de intentos fallidos de forma atómica y fija bloqueado_hasta al alcanzar p_max_intentos.';
