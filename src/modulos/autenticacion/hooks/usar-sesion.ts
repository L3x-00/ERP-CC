'use client';

import { useQuery } from '@tanstack/react-query';
import { obtenerSesion } from '@/modulos/autenticacion/servicios/obtener-sesion';

/**
 * Hook que obtiene la sesión Supabase actual del navegador (tokens y expiración).
 *
 * @returns Resultado de useQuery con `data: Session | null`.
 */
// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks`
// (que detecta hooks por el patrón `/^use[A-Z0-9]/`) reconozca esta función.
// Se exporta con el nombre en español exigido por el contrato mediante alias.
function useSesion() {
  return useQuery({
    queryKey: ['sesion-actual'],
    queryFn: () => obtenerSesion(),
  });
}

export { useSesion as usarSesion };
