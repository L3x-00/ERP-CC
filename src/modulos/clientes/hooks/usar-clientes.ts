'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import {
  obtenerClientes,
  type FiltrosClientes,
} from '@/modulos/clientes/servicios/obtener-clientes';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks` (detecta
// hooks por `/^use[A-Z0-9]/`). Se exporta con el nombre en español vía alias.
function useClientes(filtros?: FiltrosClientes) {
  return useQuery({
    queryKey: ['clientes', filtros ?? null],
    queryFn: () => obtenerClientes(crearClienteSupabase(), filtros),
  });
}

export { useClientes as usarClientes };
