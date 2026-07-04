'use client';

import { useQuery } from '@tanstack/react-query';
import { obtenerUsuario } from '@/modulos/autenticacion/servicios/obtener-usuario';

/**
 * Hook que obtiene el usuario autenticado actual con sus permisos resueltos.
 * Usa TanStack Query con caché de 5 minutos y sin reintentos
 * (si no hay sesión, `obtenerUsuario` retorna null y no tiene caso reintentar).
 *
 * @returns Resultado de useQuery con `data: UsuarioAutenticado | null`.
 */
// Nombre interno con prefijo `use` para que `react-hooks/rules-of-hooks`
// (que detecta hooks por el patrón `/^use[A-Z0-9]/`) reconozca esta función.
// Se exporta con el nombre en español exigido por el contrato mediante alias.
function useUsuario() {
  return useQuery({
    queryKey: ['usuario-actual'],
    queryFn: () => obtenerUsuario(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export { useUsuario as usarUsuario };
