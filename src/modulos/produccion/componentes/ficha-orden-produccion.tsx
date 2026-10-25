'use client';

import type {
  AreaCatalogoProduccion,
  OrdenTableroProduccion,
  PartidaTableroProduccion,
} from '@/modulos/produccion/servicios/indice';
import type { RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import { ETIQUETA_TURNO } from '@/modulos/planeacion/utilidades/etiquetas';
import { textoODefecto } from '@/modulos/planeacion/utilidades/desglose';

export interface PropsFichaOrdenProduccion {
  orden: OrdenTableroProduccion;
  areas: readonly AreaCatalogoProduccion[];
  responsables: Readonly<Record<string, string>>;
  recursos: readonly RecursoPlaneacion[];
}

function fecha(valor: string | null | undefined): string {
  if (!valor) return 'Por definir';
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const fecha = new Date(soloFecha ? `${valor}T00:00:00.000Z` : valor);
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(soloFecha ? { timeZone: 'UTC' as const } : {}),
  });
}

function numero(valor: number): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(valor);
}

function materialTexto(partida: PartidaTableroProduccion): string {
  if (!partida.materialNombre && !partida.materialCodigo) return 'Por definir';
  const nombre = partida.materialNombre ?? partida.materialCodigo;
  const dimensiones =
    partida.materialAnchoMm !== null && partida.materialAnchoMm !== undefined
    && partida.materialLargoMm !== null && partida.materialLargoMm !== undefined
      ? ` · ${numero(partida.materialAnchoMm)} × ${numero(partida.materialLargoMm)} mm`
      : '';
  const unidad = partida.materialUnidad ? ` (${partida.materialUnidad})` : '';
  return `${nombre}${unidad}${dimensiones}`;
}

function programacionTexto(
  partida: PartidaTableroProduccion,
  recursos: readonly RecursoPlaneacion[],
  metaProcesoId?: string,
): string {
  const vigentes = partida.programaciones
    .filter((programacion) => (
      metaProcesoId === undefined || programacion.metaProcesoId === metaProcesoId
    ))
    .sort((primera, segunda) => primera.fechaProgramada.localeCompare(segunda.fechaProgramada));
  const programacion = vigentes[0];
  if (!programacion) return 'Sin programar';
  const recurso = recursos.find((actual) => actual.id === programacion.recursoId);
  return `${recurso?.codigo ?? 'Recurso'} · ${fecha(programacion.fechaProgramada)} · ${ETIQUETA_TURNO[programacion.turno]}`;
}

/**
 * Ficha de contexto de la orden para Producción: reúne en un solo lugar los
 * datos que antes había que buscar entre el Kanban, Planeación, Órdenes y el
 * detalle de la partida. Solo lee; no sustituye la ficha completa de Órdenes.
 */
export function FichaOrdenProduccion({
  orden,
  areas,
  responsables,
  recursos,
}: PropsFichaOrdenProduccion) {
  const nombresArea = new Map(areas.map((area) => [area.codigo, area.nombre]));
  const estaciones = [
    ...new Set(
      orden.partidas
        .map((partida) => partida.maquinaAsignada)
        .filter((valor): valor is string => Boolean(valor)),
    ),
  ];
  const responsablesOrden = [
    ...new Set(
      orden.partidas
        .map((partida) => partida.operadorAsignadoId)
        .filter((valor): valor is string => Boolean(valor))
        .map((id) => responsables[id] ?? 'Operador'),
    ),
  ];

  return (
    <section
      data-testid="ficha-orden-produccion"
      aria-label={`Ficha de la orden ${orden.folio}`}
      className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie-2/50 p-3"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-texto-secundario">Cliente</dt>
          <dd className="font-medium text-texto-primario">{orden.clienteNombre ?? 'Cliente'}</dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Compromiso comercial</dt>
          <dd className="font-medium text-texto-primario">
            {fecha(orden.fechaCompromisoComercial ?? orden.fechaCompromiso)}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Prioridad</dt>
          <dd className="font-medium capitalize text-texto-primario">{orden.prioridad}</dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Estación / área</dt>
          <dd className="font-medium text-texto-primario">
            {estaciones.length > 0 ? estaciones.join(', ') : 'Por definir'}
            {orden.partidas.some((partida) => partida.areaTrabajoCodigo) ? ' · ' : ''}
            {[
              ...new Set(
                orden.partidas
                  .map((partida) => partida.areaTrabajoCodigo)
                  .filter((valor): valor is string => Boolean(valor))
                  .map((codigo) => nombresArea.get(codigo) ?? codigo),
              ),
            ].join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Responsable asignado</dt>
          <dd className="font-medium text-texto-primario">
            {responsablesOrden.length > 0 ? responsablesOrden.join(', ') : 'Sin asignar'}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Notas de la orden</dt>
          <dd className="text-texto-primario">{textoODefecto(orden.notas)}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        {orden.partidas.map((partida) => (
          <article
            key={partida.id}
            className="rounded-md border border-borde bg-superficie p-3 text-xs"
            data-testid={`ficha-partida-${partida.id}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-sm font-semibold text-texto-primario">
                {partida.codigoPieza}
              </p>
              <p className="text-texto-secundario">
                {numero(partida.cantidadProducida)}/{numero(partida.cantidadSolicitada)} piezas
                {' · '}{numero(partida.cantidadScrap)} scrap
                {' · '}{numero(partida.cantidadEntregada)} entregadas
              </p>
            </div>
            {partida.descripcion ? (
              <p className="mt-1 text-texto-secundario">{partida.descripcion}</p>
            ) : null}
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
              <div>
                <dt className="text-texto-tenue">Material</dt>
                <dd className="text-texto-primario">{materialTexto(partida)}</dd>
              </div>
              <div>
                <dt className="text-texto-tenue">Programación</dt>
                <dd className="text-texto-primario">{programacionTexto(partida, recursos)}</dd>
              </div>
              <div>
                <dt className="text-texto-tenue">Tiempo estimado</dt>
                <dd className="text-texto-primario">{numero(partida.tiempoEstimadoMinutos)} min</dd>
              </div>
            </dl>
            <div className="mt-2">
              <p className="font-medium text-texto-secundario">Ruta de fabricación</p>
              {partida.metasProceso.length > 0 ? (
                <ol className="mt-1 flex flex-col gap-1">
                  {partida.metasProceso.map((meta) => (
                    <li key={meta.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-texto-tenue">{meta.secuencia}</span>
                      <span className="font-medium text-texto-primario">{meta.nombre}</span>
                      <span className="text-texto-secundario">
                        {numero(meta.hechoPiezas)}/{numero(meta.metaPiezas)} · {Math.round(meta.porcentaje)}%
                      </span>
                      <span className="text-texto-tenue">
                        {programacionTexto(partida, recursos, meta.id)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : partida.procesos && partida.procesos.length > 0 ? (
                <p className="mt-1 text-texto-secundario">{partida.procesos.join(' · ')}</p>
              ) : (
                <p className="mt-1 text-texto-tenue">Ruta por definir en la orden.</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
