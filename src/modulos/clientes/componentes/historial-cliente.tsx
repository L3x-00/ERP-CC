'use client';

import { useState } from 'react';

import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import {
  usarCotizacionesCliente,
  usarOrdenesCliente,
  usarSincronizacionHistorialCliente,
} from '@/modulos/clientes/hooks/usar-historial-cliente';
import type {
  CotizacionHistorial,
  OrdenHistorial,
} from '@/modulos/clientes/tipos/historial';

/**
 * Historial real del cliente: cotizaciones y órdenes de producción, cada una
 * con su propia paginación (una entidad no arrastra a la otra) y su propio
 * estado de carga/vacío/error.
 *
 * Lo que se ve depende de RLS: un usuario con `ver_clientes` pero sin acceso al
 * pipeline verá el bloque de cotizaciones vacío, no un error. No se muestran
 * importes de Cobranza ni costos; los folios no enlazan a un detalle porque hoy
 * no existe una ruta de detalle por folio, y enlazar el listado genérico sería
 * prometer una navegación que no lleva al registro.
 */
export function HistorialCliente({ clienteId }: { clienteId: string }) {
  usarSincronizacionHistorialCliente(clienteId);

  return (
    <div className="flex flex-col gap-6" data-testid="historial-cliente">
      <SeccionCotizaciones key={`cotizaciones-${clienteId}`} clienteId={clienteId} />
      <SeccionOrdenes key={`ordenes-${clienteId}`} clienteId={clienteId} />
    </div>
  );
}

function SeccionCotizaciones({ clienteId }: { clienteId: string }) {
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isError, refetch, isFetching } = usarCotizacionesCliente(
    clienteId,
    pagina,
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
            {cotizacion.folioCnc ?? cotizacion.folioOp}
          </span>
          <span className="text-xs text-texto-secundario">
            {formatearFecha(cotizacion.fechaEnvioCotizacion ?? cotizacion.creadoEn)}
            {cotizacion.folioCnc ? ` · ${cotizacion.folioOp}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEstado estado={cotizacion.etapa} />
          <span className="tabular-nums text-sm font-medium text-texto-primario">
            {cotizacion.subtotal === null
              ? 'Importe no disponible'
              : formatearMoneda(cotizacion.subtotal, cotizacion.moneda)}
          </span>
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
            <p className="text-sm text-texto-secundario">La cotización no tiene líneas.</p>
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

function BotonExpandir({
  expandida,
  idDetalle,
  etiqueta,
  onAlternar,
}: {
  expandida: boolean;
  idDetalle: string;
  etiqueta: string;
  onAlternar: () => void;
}) {
  return (
    <Button
      variante="fantasma"
      tamano="sm"
      onClick={onAlternar}
      aria-expanded={expandida}
      aria-controls={idDetalle}
      aria-label={`${expandida ? 'Ocultar' : 'Ver'} ${etiqueta}`}
    >
      {expandida ? 'Ocultar detalle' : 'Ver detalle'}
    </Button>
  );
}

function BloqueError({
  mensaje,
  reintentando,
  onReintentar,
}: {
  mensaje: string;
  reintentando: boolean;
  onReintentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro-texto"
    >
      <span>{mensaje}</span>
      <Button variante="contorno" tamano="sm" onClick={onReintentar} disabled={reintentando}>
        {reintentando ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </div>
  );
}

function SkeletonHistorial({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={etiqueta}>
      {[0, 1, 2].map((indice) => (
        <Skeleton key={indice} className="h-16 w-full" />
      ))}
    </div>
  );
}

function Paginador({
  etiqueta,
  pagina,
  total,
  porPagina,
  onCambiar,
}: {
  etiqueta: string;
  pagina: number;
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (totalPaginas <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-texto-secundario">
      <span>
        Página {pagina} de {totalPaginas}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variante="contorno"
          tamano="sm"
          onClick={() => onCambiar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          aria-label={`Página anterior de ${etiqueta}`}
        >
          Anterior
        </Button>
        <Button
          variante="contorno"
          tamano="sm"
          onClick={() => onCambiar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          aria-label={`Página siguiente de ${etiqueta}`}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
