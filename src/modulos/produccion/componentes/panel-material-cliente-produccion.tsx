'use client';

import { useQuery } from '@tanstack/react-query';

import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { obtenerMaterialClienteOrdenAccion } from '../acciones/indice';
import { CLAVE_MATERIAL_CLIENTE_ORDEN } from './claves-consulta';

/**
 * C13.3: material del cliente por partida en solo lectura. Muestra lo
 * declarado, lo consumido y el saldo; no altera el costo de la orden.
 */
export function PanelMaterialClienteProduccion({ orden }: { orden: OrdenTableroProduccion | null }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_MATERIAL_CLIENTE_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerMaterialClienteOrdenAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
  });
  const materiales = consulta.data ?? [];

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-material-cliente">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Material del cliente</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          Lo que aportó el cliente, lo consumido en piso y el saldo. No se costea como material propio.
        </p>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudo cargar el material del cliente.
        </p>
      )}
      {orden && !consulta.isLoading && materiales.length === 0 && (
        <EstadoVacio
          titulo="Sin material del cliente"
          descripcion="La propuesta de esta orden no declara material aportado por el cliente."
        />
      )}
      {materiales.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-material-cliente-produccion">
          {materiales.map((material) => (
            <li
              key={`${material.partidaId}-${material.materialId}`}
              className="rounded-md border border-borde p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{material.codigoPieza}</strong> · {material.materialCodigo}
                  {' '}{material.materialNombre}
                </span>
                <span
                  className={
                    material.saldo <= 0
                      ? 'text-xs font-semibold text-peligro-texto'
                      : 'text-xs text-texto-secundario'
                  }
                >
                  Saldo {formatearNumero(material.saldo, 3)} {material.unidadBase}
                </span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                Declarado {formatearNumero(material.declarado, 3)} · consumido{' '}
                {formatearNumero(material.consumido, 3)} {material.unidadBase}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
