'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import { cambiarEstadoOrdenAccion } from '@/modulos/ordenes/acciones/cambiar-estado-orden';
import {
  ESTADOS_ORDEN_PRODUCCION,
  type EstadoOrden,
  type PrioridadOrden,
} from '@/modulos/ordenes/tipos/ordenes';

/** Partida tal como la necesita la tabla (proyección plana del servidor). */
export type PartidaTabla = {
  id: string;
  codigoPieza: string;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  maquinaAsignada: string | null;
};

/** Orden tal como la necesita la tabla (proyección plana del servidor). */
export type OrdenTabla = {
  id: string;
  folio: string;
  estado: EstadoOrden;
  prioridad: PrioridadOrden;
  fechaCompromiso: string;
  partidas: PartidaTabla[];
};

const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

const CLASE_ESTADO: Record<EstadoOrden, string> = {
  borrador: 'bg-foreground/10 text-foreground/70',
  programada: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  en_proceso: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  pausada: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  completada: 'bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200',
  cancelada: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
};

const ETIQUETA_PRIORIDAD: Record<PrioridadOrden, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const CLASE_PRIORIDAD: Record<PrioridadOrden, string> = {
  baja: 'text-foreground/60',
  normal: 'text-foreground/80',
  alta: 'font-semibold text-amber-700 dark:text-amber-300',
  urgente: 'font-semibold text-red-700 dark:text-red-300',
};

const CLASE_BOTON_SECUNDARIO =
  'rounded-base border border-foreground/20 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40';
const CLASE_SELECT =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';

const ACCIONES_RAPIDAS: Record<EstadoOrden, readonly { etiqueta: string; estado: EstadoOrden }[]> = {
  borrador: [{ etiqueta: 'Programar', estado: 'programada' }],
  programada: [{ etiqueta: 'Iniciar', estado: 'en_proceso' }],
  en_proceso: [
    { etiqueta: 'Pausar', estado: 'pausada' },
    { etiqueta: 'Completar', estado: 'completada' },
  ],
  pausada: [{ etiqueta: 'Reanudar', estado: 'en_proceso' }],
  completada: [],
  cancelada: [],
};

/** Avance agregado de una orden: producido / solicitado en todas sus partidas. */
function calcularAvance(partidas: PartidaTabla[]): {
  porcentaje: number;
  producido: number;
  solicitado: number;
  scrap: number;
} {
  const solicitado = partidas.reduce((suma, partida) => suma + partida.cantidadSolicitada, 0);
  const producido = partidas.reduce((suma, partida) => suma + partida.cantidadProducida, 0);
  const scrap = partidas.reduce((suma, partida) => suma + partida.cantidadScrap, 0);
  // Sin cantidad solicitada no hay base de comparación: se reporta 0, no NaN.
  const porcentaje =
    solicitado <= 0 ? 0 : Math.min(100, Math.round((producido / solicitado) * 100));

  return { porcentaje, producido, solicitado, scrap };
}

type PropsTablaOrdenes = {
  ordenes: OrdenTabla[];
};

/**
 * Tabla de órdenes de producción para el piso: filtra por máquina y estado desde
 * `usarTiendaOrdenes`, marca la orden activa y muestra el avance agregado de cada
 * OP. No consulta datos — recibe la proyección ya resuelta en el servidor y sólo
 * solicita una revalidación inmediata tras sus acciones propias; los cambios
 * de otras estaciones llegan automáticamente mediante Realtime.
 */
export function TablaOrdenes({ ordenes }: PropsTablaOrdenes) {
  const router = useRouter();
  const ordenActivaId = usarTiendaOrdenes((estado) => estado.ordenActivaId);
  const filtroMaquina = usarTiendaOrdenes((estado) => estado.filtroMaquina);
  const filtrosEstado = usarTiendaOrdenes((estado) => estado.filtrosEstado);
  const seleccionarOrden = usarTiendaOrdenes((estado) => estado.seleccionarOrden);
  const establecerFiltroMaquina = usarTiendaOrdenes((estado) => estado.establecerFiltroMaquina);
  const alternarFiltroEstado = usarTiendaOrdenes((estado) => estado.alternarFiltroEstado);
  const limpiarFiltros = usarTiendaOrdenes((estado) => estado.limpiarFiltros);
  const [ordenActualizandoId, setOrdenActualizandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  const maquinas = useMemo(() => {
    const encontradas = new Set<string>();
    for (const orden of ordenes) {
      for (const partida of orden.partidas) {
        if (partida.maquinaAsignada !== null && partida.maquinaAsignada.trim() !== '') {
          encontradas.add(partida.maquinaAsignada);
        }
      }
    }
    return [...encontradas].sort((a, b) => a.localeCompare(b, 'es'));
  }, [ordenes]);

  const ordenesVisibles = useMemo(
    () =>
      ordenes.filter((orden) => {
        const pasaEstado =
          filtrosEstado.length === 0 || filtrosEstado.includes(orden.estado);
        const pasaMaquina =
          filtroMaquina === null ||
          orden.partidas.some((partida) => partida.maquinaAsignada === filtroMaquina);
        return pasaEstado && pasaMaquina;
      }),
    [ordenes, filtrosEstado, filtroMaquina],
  );

  function alSeleccionarOrden(ordenId: string): void {
    seleccionarOrden(ordenId === ordenActivaId ? null : ordenId);
  }

  function alRefrescar(): void {
    router.refresh();
  }

  async function cambiarEstado(orden: OrdenTabla, estado: EstadoOrden): Promise<void> {
    setErrorAccion(null);
    setOrdenActualizandoId(orden.id);
    try {
      const respuesta = await cambiarEstadoOrdenAccion({
        ordenId: orden.id,
        estadoActual: orden.estado,
        estado,
      });
      if (!respuesta.exito) {
        setErrorAccion(respuesta.error);
        return;
      }
      router.refresh();
    } catch {
      setErrorAccion('No se pudo actualizar la orden. Intenta de nuevo.');
    } finally {
      setOrdenActualizandoId(null);
    }
  }

  return (
    <div
      data-testid="tabla-ordenes"
      data-hidratado={hidratado ? 'true' : 'false'}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-maquina" className="text-xs font-medium text-foreground/70">
              Máquina
            </label>
            <select
              id="filtro-maquina"
              value={filtroMaquina ?? ''}
              onChange={(evento) =>
                establecerFiltroMaquina(
                  evento.target.value === '' ? null : evento.target.value,
                )
              }
              className={CLASE_SELECT}
            >
              <option value="">Todas las máquinas</option>
              {maquinas.map((maquina) => (
                <option key={maquina} value={maquina}>
                  {maquina}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-foreground/70">Estado</legend>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_ORDEN_PRODUCCION.map((estado) => {
                const activo = filtrosEstado.includes(estado);
                return (
                  <button
                    key={estado}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => alternarFiltroEstado(estado)}
                    className={`rounded-base border px-2.5 py-1 text-xs font-medium transition-colors ${
                      activo
                        ? 'border-primario bg-primario text-white'
                        : 'border-foreground/20 hover:bg-foreground/5'
                    }`}
                  >
                    {ETIQUETA_ESTADO[estado]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={limpiarFiltros}
            disabled={filtroMaquina === null && filtrosEstado.length === 0}
            className={CLASE_BOTON_SECUNDARIO}
          >
            Limpiar filtros
          </button>
          <button type="button" onClick={alRefrescar} className={CLASE_BOTON_SECUNDARIO}>
            Actualizar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-base border border-foreground/10">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Órdenes de producción con estado, prioridad y avance agregado
          </caption>
          <thead className="border-b border-foreground/10 bg-foreground/5 text-xs uppercase text-foreground/60">
            <tr>
              <th scope="col" className="px-3 py-2">
                Folio
              </th>
              <th scope="col" className="px-3 py-2">
                Estado
              </th>
              <th scope="col" className="px-3 py-2">
                Prioridad
              </th>
              <th scope="col" className="px-3 py-2">
                Compromiso
              </th>
              <th scope="col" className="px-3 py-2">
                Partidas
              </th>
              <th scope="col" className="px-3 py-2">
                Avance
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/5">
            {ordenesVisibles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-foreground/60">
                  Sin órdenes que coincidan con los filtros.
                </td>
              </tr>
            )}

            {ordenesVisibles.map((orden) => {
              const avance = calcularAvance(orden.partidas);
              const activa = orden.id === ordenActivaId;

              return (
                <tr
                  key={orden.id}
                  aria-selected={activa}
                  className={activa ? 'bg-primario/10' : 'hover:bg-foreground/5'}
                >
                  <th scope="row" className="px-3 py-2 font-medium">
                    {orden.folio}
                  </th>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-base px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO[orden.estado]}`}
                    >
                      {ETIQUETA_ESTADO[orden.estado]}
                    </span>
                  </td>
                  <td className={`px-3 py-2 ${CLASE_PRIORIDAD[orden.prioridad]}`}>
                    {ETIQUETA_PRIORIDAD[orden.prioridad]}
                  </td>
                  <td className="px-3 py-2">{formatearFecha(orden.fechaCompromiso)}</td>
                  <td className="px-3 py-2 text-foreground/70">
                    {orden.partidas.length}
                    {avance.scrap > 0 && (
                      <span className="ml-2 text-xs text-red-700 dark:text-red-300">
                        {avance.scrap} scrap
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={avance.porcentaje}
                        aria-label={`Avance de la orden ${orden.folio}`}
                        className="h-2 w-24 overflow-hidden rounded-base bg-foreground/10"
                      >
                        <div
                          className="h-full bg-primario"
                          style={{ width: `${avance.porcentaje}%` }}
                        />
                      </div>
                      <span className="text-xs text-foreground/70">
                        {avance.porcentaje}% ({avance.producido}/{avance.solicitado})
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {ACCIONES_RAPIDAS[orden.estado].map((accion) => (
                        <button
                          key={accion.estado}
                          type="button"
                          data-testid={`cambiar-estado-${accion.estado}`}
                          onClick={() => void cambiarEstado(orden, accion.estado)}
                          disabled={ordenActualizandoId !== null}
                          className={CLASE_BOTON_SECUNDARIO}
                        >
                          {ordenActualizandoId === orden.id ? 'Actualizando…' : accion.etiqueta}
                        </button>
                      ))}
                    <button
                      type="button"
                      aria-pressed={activa}
                      onClick={() => alSeleccionarOrden(orden.id)}
                      className={CLASE_BOTON_SECUNDARIO}
                    >
                      {activa ? 'Quitar selección' : 'Seleccionar'}
                    </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {errorAccion && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errorAccion}
        </p>
      )}

      <p aria-live="polite" className="text-sm text-foreground/70">
        {ordenesVisibles.length} de {ordenes.length} orden(es)
      </p>
    </div>
  );
}
