'use client';

import { useQuery } from '@tanstack/react-query';
import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { obtenerClientePorId } from '@/modulos/clientes/servicios/obtener-cliente-por-id';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`. Se exporta
// con el nombre en español vía alias.
function useCliente(id: string | null) {
  return useQuery({
    queryKey: ['cliente', id],
    queryFn: () => (id ? obtenerClientePorId(crearClienteSupabase(), id) : null),
    enabled: id !== null,
  });
}

export { useCliente as usarCliente };
