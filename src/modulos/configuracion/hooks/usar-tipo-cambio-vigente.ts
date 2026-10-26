'use client';

import { useQuery } from '@tanstack/react-query';
import { obtenerTipoCambioVigenteAccion } from '@/modulos/configuracion/acciones/obtener-tipo-cambio-vigente';
import { CLAVE_TIPO_CAMBIO_VIGENTE } from '@/modulos/configuracion/componentes/claves-consulta';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`. Se exporta
// con el nombre en español vía alias.
function useTipoCambioVigente(activo = true): number | null {
  const consulta = useQuery({
    queryKey: CLAVE_TIPO_CAMBIO_VIGENTE,
    enabled: activo,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const respuesta = await obtenerTipoCambioVigenteAccion();
      return respuesta.exito && respuesta.datos ? respuesta.datos.tipoCambioUsd : null;
    },
  });

  return consulta.data ?? null;
}

export { useTipoCambioVigente as usarTipoCambioVigente };
