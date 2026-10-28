'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { formatearNumero } from '@/compartido/utilidades/formatear';
import {
  obtenerAccesosOrdenAccion,
  type AccesosOrden,
} from '@/modulos/produccion/acciones/obtener-accesos-orden';
import { CLAVE_ACCESOS_ORDEN } from '@/modulos/produccion/componentes/claves-consulta';

const CLASE_ENLACE =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie';

const ETIQUETAS_ESTADO_FACTURA: Record<string, string> = {
  BORRADOR: 'Borrador',
  EMITIDA: 'Emitida',
  CANCELADA: 'Cancelada',
};

function etiquetaEstadoFactura(estado: string): string {
  return ETIQUETAS_ESTADO_FACTURA[estado] ?? estado;
}

/**
 * Accesos rápidos de una orden concluida: origen comercial (RFQ y propuesta),
 * notas de entrega, ficha completa y facturación. Los enlaces los decide el
 * servidor según los permisos reales del usuario; aquí solo se pintan.
 */
export function AccesosRapidosOrden({ ordenId }: { ordenId: string }) {
  const consulta = useQuery({
    queryKey: [...CLAVE_ACCESOS_ORDEN, ordenId],
    queryFn: async (): Promise<AccesosOrden> => {
      const respuesta = await obtenerAccesosOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 60_000,
  });
  const datos = consulta.data ?? null;

  return (
    <section
      aria-labelledby="titulo-accesos-rapidos"
      className="rounded-lg border border-borde bg-superficie p-4"
      data-testid="accesos-rapidos-orden"
    >
      <h2 id="titulo-accesos-rapidos" className="text-base font-semibold text-texto-primario">
        Accesos rápidos
      </h2>
      <p className="mt-1 text-sm text-texto-secundario">
        Consulta el origen comercial, las entregas y la facturación de la orden sin salir del detalle.
      </p>

      {consulta.isPending ? (
        <p className="mt-3 text-sm text-texto-secundario" role="status">Cargando accesos…</p>
      ) : null}
      {consulta.isError ? (
        <p className="mt-3 text-sm text-peligro-texto" role="alert">
          No se pudieron cargar los accesos rápidos.
        </p>
      ) : null}

      {datos ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {datos.permisos.rfq && datos.rfq ? (
            <Link
              href={`/rfq?rfq=${datos.rfq.id}`}
              className={CLASE_ENLACE}
              data-testid="acceso-rapido-rfq"
              prefetch={false}
            >
              Ver RFQ{datos.rfq.folio ? ` ${datos.rfq.folio}` : ''}
            </Link>
          ) : null}
          {datos.permisos.propuesta && datos.propuesta ? (
            <Link
              href={`/propuestas?propuesta=${datos.propuesta.id}`}
              className={CLASE_ENLACE}
              data-testid="acceso-rapido-propuesta"
              prefetch={false}
            >
              Ver propuesta {datos.propuesta.folio}
            </Link>
          ) : null}
          {datos.permisos.entregas ? (
            <Link
              href={`/entregas?orden=${ordenId}`}
              className={CLASE_ENLACE}
              data-testid="acceso-rapido-entregas"
              prefetch={false}
            >
              Ver notas de entrega
            </Link>
          ) : null}
          {datos.permisos.facturas ? (
            <Link
              href="/facturacion"
              className={CLASE_ENLACE}
              data-testid="acceso-rapido-facturas"
              prefetch={false}
            >
              Ver facturación
            </Link>
          ) : null}
          {datos.permisos.ficha ? (
            <Link
              href={`/ordenes/${ordenId}`}
              className={CLASE_ENLACE}
              data-testid="acceso-rapido-ficha"
              prefetch={false}
            >
              Ver ficha completa
            </Link>
          ) : null}
        </div>
      ) : null}

      {datos && datos.permisos.facturas && datos.facturas.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-borde pt-3 text-sm" data-testid="facturas-orden">
          {datos.facturas.map((factura) => (
            <li key={factura.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/entregas/${factura.entregaId}`}
                className="font-mono text-xs font-semibold text-acento underline"
                prefetch={false}
              >
                {factura.folioFiscal ?? factura.entregaFolio ?? 'Factura'}
              </Link>
              <span className="text-xs text-texto-secundario">
                {etiquetaEstadoFactura(factura.estado)}
                {factura.entregaFolio ? ` · entrega ${factura.entregaFolio}` : ''}
                {factura.total !== null ? ` · $${formatearNumero(factura.total)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {datos && datos.permisos.facturas && datos.facturas.length === 0 ? (
        <p className="mt-3 text-sm text-texto-secundario">
          La orden aún no tiene facturas registradas.
        </p>
      ) : null}
    </section>
  );
}
