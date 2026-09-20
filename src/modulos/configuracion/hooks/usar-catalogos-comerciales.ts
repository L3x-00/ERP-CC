'use client';

import { useQuery } from '@tanstack/react-query';
import { CATALOGO_TIERS_DEFECTO } from '@/modulos/clientes/tipos/indice';
import {
  obtenerCatalogosComercialesAccion,
  type CatalogosComerciales,
} from '@/modulos/configuracion/acciones/indice';
import { CLAVE_CATALOGOS_COMERCIALES } from '@/modulos/configuracion/componentes/claves-consulta';
import { CATEGORIAS_GASTO } from '@/modulos/gastos/tipos/gastos';

// Nombre interno con prefijo `use` para `react-hooks/rules-of-hooks`. Se exporta
// con el nombre en español vía alias.
function useCatalogosComerciales(): CatalogosComerciales {
  const consulta = useQuery({
    queryKey: CLAVE_CATALOGOS_COMERCIALES,
    queryFn: async (): Promise<CatalogosComerciales | null> => {
      const respuesta = await obtenerCatalogosComercialesAccion();
      return respuesta.exito && respuesta.datos ? respuesta.datos : null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    tiers: consulta.data?.tiers ?? CATALOGO_TIERS_DEFECTO,
    categoriasGasto: consulta.data?.categoriasGasto ?? CATEGORIAS_GASTO,
  };
}

export { useCatalogosComerciales as usarCatalogosComerciales };
