'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import {
  obtenerMaterialesServicio,
  type FiltrosMateriales,
} from '@/modulos/inventario/servicios/inventario-servicio';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks` (detecta
// hooks por `/^use[A-Z0-9]/`). Se exporta con el nombre en español vía alias.
function useMateriales(filtros?: FiltrosMateriales) {
  return useQuery({
    queryKey: ['inventario', 'materiales', filtros ?? null],
    queryFn: () => obtenerMaterialesServicio(crearClienteSupabase(), filtros),
  });
}

export { useMateriales as usarMateriales };
