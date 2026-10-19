'use client';

import { useQuery } from '@tanstack/react-query';

import { obtenerConciliacionCostosOrdenAccion } from '@/modulos/gastos/acciones/indice';
import { CLAVE_CONCILIACION_GASTOS } from '@/modulos/gastos/componentes/claves-consulta';
import { TablaConciliacionCostos } from '@/modulos/gastos/componentes/tabla-conciliacion-costos';
import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/indice';

/** C10.2: monta la conciliación de una Orden sin acoplar la tarjeta existente. */
export function SeccionConciliacionOrden({ ordenId }: { ordenId: string }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_CONCILIACION_GASTOS, ordenId],
    queryFn: async (): Promise<ConciliacionCostosOrden> => {
      const resultado = await obtenerConciliacionCostosOrdenAccion({ ordenId });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'Sin conciliación de costos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: ordenId.length > 0,
  });

  if (consulta.isError) {
    return (
      <p role="alert" className="text-sm text-peligro-texto" data-testid="conciliacion-error">
        Conciliación no disponible.
      </p>
    );
  }
  if (consulta.isPending) {
    return (
      <p role="status" className="text-sm text-texto-secundario" data-testid="conciliacion-cargando">
        Cargando conciliación…
      </p>
    );
  }
  if (!consulta.data) return null;

  return <TablaConciliacionCostos datos={consulta.data} />;
}
