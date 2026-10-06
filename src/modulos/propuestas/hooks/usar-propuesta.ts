'use client';

import { useQuery } from '@tanstack/react-query';

import { obtenerCatalogosPropuestaAccion } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import { obtenerPropuestaAccion } from '@/modulos/propuestas/acciones/obtener-propuesta';
import { obtenerPropuestasAccion } from '@/modulos/propuestas/acciones/obtener-propuestas';
import type { FiltrosPropuestasInput } from '@/modulos/propuestas/validaciones/esquemas-propuestas';
import {
  claveCatalogosPropuesta,
  claveDetallePropuesta,
  claveListaPropuestas,
} from '@/modulos/propuestas/componentes/claves-consulta';

function usePropuesta(id: string | null) {
  return useQuery({
    queryKey: claveDetallePropuesta(id),
    queryFn: () => obtenerPropuestaAccion({ propuestaId: id }),
    enabled: id !== null,
  });
}

function usePropuestas(filtros: FiltrosPropuestasInput) {
  return useQuery({
    queryKey: claveListaPropuestas(filtros),
    queryFn: () => obtenerPropuestasAccion(filtros),
  });
}

function useCatalogosPropuesta() {
  return useQuery({
    queryKey: claveCatalogosPropuesta(),
    queryFn: () => obtenerCatalogosPropuestaAccion(),
    staleTime: 60_000,
  });
}

export { usePropuesta as usarPropuesta };
export { usePropuestas as usarPropuestas };
export { useCatalogosPropuesta as usarCatalogosPropuesta };
