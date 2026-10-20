'use client';

import { useState } from 'react';
import Link from 'next/link';

import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { ETIQUETAS_ESTADO_RFQ } from '@/modulos/rfq/utilidades/estados';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Badge } from '@/compartido/componentes/ui/badge';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import {
  BloqueError,
  BotonExpandir,
  Paginador,
  SkeletonHistorial,
} from '@/modulos/clientes/componentes/bloques-historial';
import { SeccionPropuestas } from '@/modulos/clientes/componentes/historial-propuestas-cliente';
import { ImporteCotizacion } from '@/modulos/clientes/componentes/importe-cotizacion';
import {
  usarCotizacionesCliente,
  usarNotasOperativasCliente,
  usarOrdenesCliente,
  usarSincronizacionHistorialCliente,
} from '@/modulos/clientes/hooks/usar-historial-cliente';
import type {
  CotizacionHistorial,
  NotaOperativaCliente,
  OrdenHistorial,
} from '@/modulos/clientes/tipos/historial';

/**
 * Historial real del cliente: cotizaciones, propuestas y órdenes de producción,
 * cada una con su propia paginación (una entidad no arrastra a la otra) y su
 * propio estado de carga/vacío/error.
 *
 * Lo que se ve depende de RLS: un usuario con `ver_clientes` pero sin acceso al
 * pipeline verá el bloque de cotizaciones vacío, no un error. No se muestran
 * importes de Cobranza ni costos. `puedeVerPropuestas` (permiso `propuesta_vista`,
 * resuelto en el servidor) solo decide si se consulta y muestra la sección de
 * Propuestas y si el importe faltante se rotula «no visible para tu rol»; la
 * RLS de Propuestas sigue siendo la autoridad.
 *
 * OBS-11: cada registro enlaza a su original (cotización → editor del pipeline,
 * orden → tablero de Órdenes) y las notas de taller de los operadores se
 * consultan automáticamente por Server Action bajo `ver_clientes` (D-14: son
 * notas internas, no se envían al cliente).
 */
export function HistorialCliente({
  clienteId,
  puedeVerPropuestas = false,
}: {
  clienteId: string;
  puedeVerPropuestas?: boolean;
}) {
  usarSincronizacionHistorialCliente(clienteId);

  return (
    <div className="flex flex-col gap-6" data-testid="historial-cliente">
      <SeccionCotizaciones
        key={`cotizaciones-${clienteId}`}
        clienteId={clienteId}
        puedeVerPropuestas={puedeVerPropuestas}
      />
      {puedeVerPropuestas && <SeccionPropuestas key={`propuestas-${clienteId}`} clienteId={clienteId} />}
      <SeccionOrdenes key={`ordenes-${clienteId}`} clienteId={clienteId} />
      <SeccionNotas key={`notas-${clienteId}`} clienteId={clienteId} />
    </div>
  );
}

function SeccionCotizaciones({
  clienteId,
  puedeVerPropuestas,
}: {
  clienteId: string;
  puedeVerPropuestas: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usarCotizacionesCliente(
    clienteId,
    pagina,
    puedeVerPropuestas,
  );

  return (
    <section aria-labelledby="historial-cotizaciones-titulo" className="flex flex-col gap-3">
      <h3 id="historial-cotizaciones-titulo" className="text-sm font-semibold text-texto-primario">
        Cotizaciones
        {data ? <span className="ml-2 font-normal text-texto-secundario">{data.total}</span> : null}
      </h3>

      {isLoading && <SkeletonHistorial etiqueta="Cargando cotizaciones" />}

      {isError && (
        <BloqueError
          mensaje="No se pudieron cargar las cotizaciones del cliente."
          reintentando={isFetching}
          onReintentar={() => void refetch()}
        />
      )}

      {!isLoading && !isError && data?.registros.length === 0 && (
        <EstadoVacio
          titulo="Sin cotizaciones"
          descripcion="Este cliente no tiene cotizaciones visibles para tu rol."
        />
      )}

      {!isLoading && !isError && data && data.registros.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.registros.map((cotizacion) => (
            <li key={cotizacion.id}>
              <FilaCotizacion cotizacion={cotizacion} />
            </li>
          ))}
        </ul>
      )}

      {!isError && data?.registros.some((registro) => registro.lineas === null) && (
        <BloqueError mensaje="Detalle de cotización incompleto." reintentando={isFetching} onReintentar={() => void refetch()} />
      )}
      {!isError && data && (
        <Paginador
          etiqueta="cotizaciones"
          pagina={data.pagina}
          total={data.total}
          porPagina={data.porPagina}
          onCambiar={setPagina}
        />
      )}
    </section>
  );
}

function FilaCotizacion({ cotizacion }: { cotizacion: CotizacionHistorial }) {
  const [expandida, setExpandida] = useState(false);
  const idDetalle = `cotizacion-detalle-${cotizacion.id}`;

  return (
    <Tarjeta className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-sm font-semibold text-texto-primario">
            {cotizacion.folioRfq ?? cotizacion.folioCnc ?? cotizacion.folioOp}
          </span>
          <span className="text-xs text-texto-secundario">
            {formatearFecha(cotizacion.fechaEnvioCotizacion ?? cotizacion.creadoEn)}
            {cotizacion.folioCnc ? ` · ${cotizacion.folioOp}` : ''}
          </span>
          <Link
            href={`/rfq?rfq=${cotizacion.id}`}
            className="w-fit text-xs text-acento underline"
            data-testid={`enlace-cotizacion-${cotizacion.id}`}
          >
            Ver RFQ
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEstado estado={cotizacion.estadoRfq} etiqueta={ETIQUETAS_ESTADO_RFQ[cotizacion.estadoRfq]} />
          <ImporteCotizacion cotizacionId={cotizacion.id} importe={cotizacion.importe} />
          <BotonExpandir
            expandida={expandida}
            idDetalle={idDetalle}
            etiqueta={`líneas de la cotización ${cotizacion.folioOp}`}
            onAlternar={() => setExpandida((valor) => !valor)}
          />
        </div>
      </div>

      {expandida && (
        <div id={idDetalle} className="mt-3 border-t border-borde pt-3">
          {cotizacion.lineas === null && (
            <p className="text-sm text-texto-secundario">
              No se pudieron recuperar las líneas de esta cotización.
            </p>
          )}
          {cotizacion.lineas?.length === 0 && (
            <p className="text-sm text-texto-secundario">
              {cotizacion.importe.tipo === 'propuesta' || cotizacion.importe.tipo === 'pendiente'
                ? 'Sin líneas en el cotizador anterior: el detalle está en la propuesta.'
                : 'La cotización no tiene líneas.'}
            </p>
          )}
          {cotizacion.lineas &&
            cotizacion.lineas.length > 0 &&
            (cotizacion.importe.tipo === 'propuesta' || cotizacion.importe.tipo === 'pendiente') && (
              <p className="pb-2 text-xs text-texto-secundario" data-testid={`nota-lineas-antiguas-${cotizacion.id}`}>
                Líneas del cotizador anterior, solo como historial: el importe vigente es el de la
                propuesta {cotizacion.importe.origen.folioRevision}.
              </p>
            )}
          {cotizacion.lineas && cotizacion.lineas.length > 0 && (
            <ul className="flex flex-col divide-y divide-borde">
              {cotizacion.lineas.map((linea) => (
                <li key={linea.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 font-medium text-texto-primario">
                      {linea.descripcion}
                      {linea.esDescuento && <Badge variante="info">Descuento</Badge>}
                    </span>
                    {!linea.esDescuento && (
                      <span className="text-xs text-texto-secundario">
                        {[
                          `${formatearNumero(linea.cantidad, 2)} pz`,
                          linea.material,
                          linea.espesor ? `esp. ${linea.espesor}` : null,
                          linea.area === null ? null : `Área geométrica: ${formatearNumero(linea.area, 3)}`,
                          linea.procesos.length > 0 ? linea.procesos.join(', ') : null,
                        ]
                          .filter((parte): parte is string => Boolean(parte))
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                  <span className="tabular-nums text-texto-primario">
                    {formatearMoneda(linea.importe, cotizacion.moneda)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function SeccionOrdenes({ clienteId }: { clienteId: string }) {
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usarOrdenesCliente(clienteId, pagina);

  return (
    <section aria-labelledby="historial-ordenes-titulo" className="flex flex-col gap-3">
      <h3 id="historial-ordenes-titulo" className="text-sm font-semibold text-texto-primario">
        Órdenes de producción
        {data ? <span className="ml-2 font-normal text-texto-secundario">{data.total}</span> : null}
      </h3>

      {isLoading && <SkeletonHistorial etiqueta="Cargando órdenes" />}

      {isError && (
        <BloqueError
          mensaje="No se pudieron cargar las órdenes del cliente."
          reintentando={isFetching}
          onReintentar={() => void refetch()}
        />
      )}

      {!isLoading && !isError && data?.registros.length === 0 && (
        <EstadoVacio
          titulo="Sin órdenes"
          descripcion="Este cliente todavía no tiene órdenes de producción."
        />
      )}

      {!isLoading && !isError && data && data.registros.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.registros.map((orden) => (
            <li key={orden.id}>
              <FilaOrden orden={orden} />
            </li>
          ))}
        </ul>
      )}

      {!isError && data?.registros.some((registro) => registro.partidas === null) && (
        <BloqueError mensaje="Detalle de orden incompleto." reintentando={isFetching} onReintentar={() => void refetch()} />
      )}
      {!isError && data && (
        <Paginador
          etiqueta="órdenes"
          pagina={data.pagina}
          total={data.total}
          porPagina={data.porPagina}
          onCambiar={setPagina}
        />
      )}
    </section>
  );
}

function FilaOrden({ orden }: { orden: OrdenHistorial }) {
  const [expandida, setExpandida] = useState(false);
  const idDetalle = `orden-detalle-${orden.id}`;

  return (
    <Tarjeta className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-sm font-semibold text-texto-primario">{orden.folio}</span>
          <span className="text-xs text-texto-secundario">
            Compromiso {formatearFecha(orden.fechaCompromiso)}
            {orden.fechaFin ? ` · Cierre ${formatearFecha(orden.fechaFin)}` : ''}
          </span>
          <Link
            href={`/ordenes?ordenId=${orden.id}`}
            className="w-fit text-xs text-acento underline"
            data-testid={`enlace-orden-${orden.id}`}
          >
            Ver orden
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEstado estado={orden.estado} />
          <BotonExpandir
            expandida={expandida}
            idDetalle={idDetalle}
            etiqueta={`partidas de la orden ${orden.folio}`}
            onAlternar={() => setExpandida((valor) => !valor)}
          />
        </div>
      </div>

      {expandida && (
        <div id={idDetalle} className="mt-3 border-t border-borde pt-3">
          {orden.partidas === null && (
            <p className="text-sm text-texto-secundario">
              No se pudieron recuperar las partidas de esta orden.
            </p>
          )}
          {orden.partidas?.length === 0 && (
            <p className="text-sm text-texto-secundario">La orden no tiene partidas.</p>
          )}
          {orden.partidas && orden.partidas.length > 0 && (
            <ul className="flex flex-col divide-y divide-borde">
              {orden.partidas.map((partida) => (
                <li key={partida.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-texto-primario">{partida.codigoPieza}</span>
                    <span className="text-xs text-texto-secundario">
                      {[
                        partida.descripcion,
                        partida.maquinaAsignada ? `Máquina ${partida.maquinaAsignada}` : null,
                      ]
                        .filter((parte): parte is string => Boolean(parte))
                        .join(' · ')}
                    </span>
                  </div>
                  <span className="tabular-nums text-xs text-texto-secundario">
                    {formatearNumero(partida.cantidadProducida, 0)} /{' '}
                    {formatearNumero(partida.cantidadSolicitada, 0)} {partida.unidadMedida}
                    {partida.cantidadScrap > 0
                      ? ` · scrap ${formatearNumero(partida.cantidadScrap, 0)}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tarjeta>
  );
}

function SeccionNotas({ clienteId }: { clienteId: string }) {
  const { data, isLoading, isError, refetch, isFetching } = usarNotasOperativasCliente(clienteId);

  return (
    <section aria-labelledby="historial-notas-titulo" className="flex flex-col gap-3">
      <h3 id="historial-notas-titulo" className="text-sm font-semibold text-texto-primario">
        Notas de taller
        {data ? <span className="ml-2 font-normal text-texto-secundario">{data.length}</span> : null}
      </h3>

      {isLoading && <SkeletonHistorial etiqueta="Cargando notas de taller" />}

      {isError && (
        <BloqueError
          mensaje="No se pudieron cargar las notas de taller."
          reintentando={isFetching}
          onReintentar={() => void refetch()}
        />
      )}

      {!isLoading && !isError && data?.length === 0 && (
        <EstadoVacio
          titulo="Sin notas de taller"
          descripcion="Los operadores todavía no registraron notas en las órdenes de este cliente."
        />
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="historial-notas">
          {data.map((nota) => (
            <li key={`${nota.origen}-${nota.id}`}>
              <NotaOperativa nota={nota} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotaOperativa({ nota }: { nota: NotaOperativaCliente }) {
  return (
    <Tarjeta className="p-3" data-testid={`nota-operativa-${nota.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-texto-primario">{nota.autorNombre}</span>
          <span className="text-xs text-texto-secundario">
            {formatearFecha(nota.fecha)} ·{' '}
            {nota.origen === 'sesion' ? 'Cierre de sesión' : (nota.accion ?? 'Registro de tiempo')}
            {nota.partidaCodigo ? ` · ${nota.partidaCodigo}` : ''}
          </span>
        </div>
        <Link
          href={`/ordenes?ordenId=${nota.ordenId}`}
          className="font-mono text-xs text-acento underline"
        >
          {nota.ordenFolio}
        </Link>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-texto-primario">{nota.texto}</p>
    </Tarjeta>
  );
}
