'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import {
  obtenerMovimientosServicio,
  type FiltrosMovimientos,
} from '@/modulos/inventario/servicios/inventario-servicio';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`; se exporta
// con el nombre en español vía alias.
function useMovimientosInventario(filtros?: FiltrosMovimientos) {
  return useQuery({
    queryKey: ['inventario', 'movimientos', filtros ?? null],
    queryFn: () => obtenerMovimientosServicio(crearClienteSupabase(), filtros),
  });
}

export { useMovimientosInventario as usarMovimientosInventario };
