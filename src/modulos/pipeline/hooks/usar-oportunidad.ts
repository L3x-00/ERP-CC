'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { obtenerOportunidadPorId } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';

// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks`
// (que detecta hooks por el patrón `/^use[A-Z0-9]/`) reconozca esta función.
// Se exporta con el nombre en español exigido por el contrato mediante alias.
function useOportunidad(id: string) {
  return useQuery({
    queryKey: ['oportunidad', id],
    queryFn: () => obtenerOportunidadPorId(crearClienteSupabase(), id),
    enabled: !!id,
  });
}

export { useOportunidad as usarOportunidad };
