'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import {
  obtenerOportunidades,
  type FiltrosPipeline,
} from '@/modulos/pipeline/servicios/obtener-oportunidades';

// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks`
// (que detecta hooks por el patrón `/^use[A-Z0-9]/`) reconozca esta función.
// Se exporta con el nombre en español exigido por el contrato mediante alias.
function usePipeline(filtros?: FiltrosPipeline) {
  return useQuery({
    queryKey: ['pipeline', filtros ?? null],
    queryFn: () => obtenerOportunidades(crearClienteSupabase(), filtros),
  });
}

export { usePipeline as usarPipeline };
