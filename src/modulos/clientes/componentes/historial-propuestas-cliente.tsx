'use client';

import { useState } from 'react';
import Link from 'next/link';

import { formatearFecha, formatearMoneda } from '@/compartido/utilidades/formatear';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Badge } from '@/compartido/componentes/ui/badge';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import {
  BloqueError,
  BotonExpandir,
  Paginador,
  SkeletonHistorial,
} from '@/modulos/clientes/componentes/bloques-historial';
import { usarPropuestasCliente } from '@/modulos/clientes/hooks/usar-historial-cliente';
import { situacionImporteRevision } from '@/modulos/clientes/servicios/importe-historial';
import type {
  EventoRevisionHistorial,
  PropuestaHistorial,
  RevisionHistorial,
} from '@/modulos/clientes/tipos/historial';
import { etiquetaAccionEventoPropuesta } from '@/modulos/clientes/utilidades/etiquetas-evento-propuesta';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';

/**
 * Propuestas del cliente con sus revisiones y la bitácora de cada revisión.
 * Solo se monta si el rol ve Propuestas; aun así la RLS es la autoridad. Solo
 * muestra precios de venta (subtotal, IVA y total): ningún costo, ruteo ni margen.
 */
export function SeccionPropuestas({ clienteId }: { clienteId: string }) {
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usarPropuestasCliente(clienteId, pagina);

  return (
    <section aria-labelledby="historial-propuestas-titulo" className="flex flex-col gap-3">
      <h3 id="historial-propuestas-titulo" className="text-sm font-semibold text-texto-primario">
        Propuestas
        {data ? <span className="ml-2 font-normal text-texto-secundario">{data.total}</span> : null}
      </h3>

      {isLoading && <SkeletonHistorial etiqueta="Cargando propuestas" />}

      {isError && (
        <BloqueError
          mensaje="No se pudieron cargar las propuestas del cliente."
          reintentando={isFetching}
          onReintentar={() => void refetch()}
        />
      )}

      {!isLoading && !isError && data?.registros.length === 0 && (
        <EstadoVacio
          titulo="Sin propuestas"
          descripcion="Este cliente no tiene propuestas visibles para tu rol."
        />
      )}

      {!isLoading && !isError && data && data.registros.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.registros.map((propuesta) => (
            <li key={propuesta.id}>
              <FilaPropuesta propuesta={propuesta} />
            </li>
          ))}
        </ul>
      )}

      {!isError && data?.registros.some((registro) => registro.revisiones === null) && (
        <BloqueError
          mensaje="Detalle de propuesta incompleto."
          reintentando={isFetching}
          onReintentar={() => void refetch()}
        />
      )}
      {!isError && data && (
        <Paginador
          etiqueta="propuestas"
          pagina={data.pagina}
          total={data.total}
          porPagina={data.porPagina}
          onCambiar={setPagina}
        />
      )}
    </section>
  );
}

function FilaPropuesta({ propuesta }: { propuesta: PropuestaHistorial }) {
  const [expandida, setExpandida] = useState(false);
  const idDetalle = `propuesta-detalle-${propuesta.id}`;
  // Más reciente primero, como la ficha de Propuestas.
  const revisiones = [...(propuesta.revisiones ?? [])].sort((a, b) => b.letra.localeCompare(a.letra));

  return (
    <Tarjeta className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-sm font-semibold text-texto-primario">{propuesta.folioCnc}</span>
          <span className="text-xs text-texto-secundario">
            Actualizada {formatearFecha(propuesta.actualizadoEn)}
          </span>
          <Link
            href={`/propuestas?propuesta=${propuesta.id}`}
            className="w-fit text-xs text-acento underline"
            data-testid={`enlace-propuesta-${propuesta.id}`}
          >
            Ver propuesta
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEstado estado={propuesta.estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[propuesta.estado]} />
          <BotonExpandir
            expandida={expandida}
            idDetalle={idDetalle}
            etiqueta={`revisiones de la propuesta ${propuesta.folioCnc}`}
            onAlternar={() => setExpandida((valor) => !valor)}
          />
        </div>
      </div>

      {expandida && (
        <div id={idDetalle} className="mt-3 border-t border-borde pt-3">
          {propuesta.revisiones === null && (
            <p className="text-sm text-texto-secundario">
              No se pudieron recuperar las revisiones de esta propuesta.
            </p>
          )}
          {propuesta.revisiones?.length === 0 && (
            <p className="text-sm text-texto-secundario">La propuesta no tiene revisiones visibles.</p>
          )}
          {revisiones.length > 0 && (
            <ul className="flex flex-col divide-y divide-borde">
              {revisiones.map((revision) => (
                <li key={revision.id} data-testid={`revision-${revision.id}`} className="flex flex-col gap-2 py-3 text-sm">
                  <FilaRevision revision={revision} aceptada={propuesta.revisionAceptadaId === revision.id} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function FilaRevision({ revision, aceptada }: { revision: RevisionHistorial; aceptada: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-texto-primario">Rev. {revision.letra}</span>
          <span className="font-mono text-xs text-texto-secundario">{revision.folioRevision}</span>
          <BadgeEstado estado={revision.estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[revision.estado]} />
          {aceptada && <Badge variante="exito">Aceptada por el cliente</Badge>}
        </div>
        <ImporteRevision revision={revision} />
      </div>
      <span className="text-xs text-texto-secundario">
        {[
          revision.partidasActivas === null
            ? null
            : `${revision.partidasActivas} ${revision.partidasActivas === 1 ? 'ítem activo' : 'ítems activos'}`,
          `Creada ${formatearFecha(revision.creadoEn)}`,
          revision.enviadoEn ? `Enviada ${formatearFecha(revision.enviadoEn)}` : null,
        ]
          .filter((parte): parte is string => Boolean(parte))
          .join(' · ')}
      </span>
      {revision.motivoCreacion && (
        <span className="text-xs text-texto-secundario">Motivo: {revision.motivoCreacion}</span>
      )}
      <EventosRevision eventos={revision.eventos} />
    </>
  );
}

function ImporteRevision({ revision }: { revision: RevisionHistorial }) {
  const situacion = situacionImporteRevision(revision);
  if (situacion === 'no-legible' || revision.importe === null) {
    return <span className="text-sm text-texto-secundario">Importe no disponible</span>;
  }
  if (situacion === 'pendiente') {
    return <span className="text-sm text-texto-secundario">Precio pendiente</span>;
  }

  const { subtotal, iva, total, moneda } = revision.importe;
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 text-xs text-texto-secundario tabular-nums">
      <span>Subtotal {formatearMoneda(subtotal, moneda)}</span>
      {iva !== null && <span>IVA {formatearMoneda(iva, moneda)}</span>}
      {total !== null && (
        <span className="text-sm font-medium text-texto-primario">
          Total {formatearMoneda(total, moneda)}
        </span>
      )}
    </span>
  );
}

function EventosRevision({ eventos }: { eventos: EventoRevisionHistorial[] | null }) {
  if (eventos === null) {
    return (
      <p className="text-xs text-texto-secundario">No se pudieron recuperar los eventos de esta revisión.</p>
    );
  }
  if (eventos.length === 0) {
    return <p className="text-xs text-texto-secundario">Sin eventos registrados.</p>;
  }

  return (
    <ul className="flex flex-col gap-1 border-l-2 border-borde pl-3" aria-label="Eventos de la revisión">
      {eventos.map((evento) => (
        <li key={evento.id} className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-texto-primario">
            {etiquetaAccionEventoPropuesta(evento.accion)}
          </span>
          <span className="text-xs text-texto-secundario">
            {[
              evento.estadoAnterior ? ETIQUETA_ESTADO_PROPIESTA[evento.estadoAnterior] : null,
              evento.estadoNuevo ? ETIQUETA_ESTADO_PROPIESTA[evento.estadoNuevo] : null,
            ]
              .filter((parte): parte is string => Boolean(parte))
              .join(' → ')}
            {evento.canal ? ` · ${evento.canal}` : ''}
            {evento.destino ? ` · ${evento.destino}` : ''}
            {' · '}
            {formatearFecha(evento.creadoEn)}
          </span>
          {evento.motivo && <span className="text-xs text-texto-tenue">{evento.motivo}</span>}
        </li>
      ))}
    </ul>
  );
}
