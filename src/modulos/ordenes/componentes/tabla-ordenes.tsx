'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { DocumentoOrdenBoton } from '@/modulos/ordenes/componentes/documento-orden-boton';
import { EditarOrdenDialog } from '@/modulos/ordenes/componentes/editar-orden-dialog';

import { formatearFecha } from '@/compartido/utilidades/formatear';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Button } from '@/compartido/componentes/ui/button';
import { Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
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
  descripcion: string | null;
  cantidadSolicitada: number;
  cantidadProducida: number;
  cantidadScrap: number;
  unidadMedida: string;
  tiempoEstimadoMinutos: number;
  maquinaAsignada: string | null;
};

/** Orden tal como la necesita la tabla (proyección plana del servidor). */
export type OrdenTabla = {
  id: string;
  folio: string;
  /** RFQ-10: folio comercial (CNC-…) de la cotización de origen, si es visible. */
  folioCotizacionCnc: string | null;
  estado: EstadoOrden;
  prioridad: PrioridadOrden;
  fechaCompromiso: string;
  /** Token de versión (ORD-05) para editar el borrador con compare-and-set. */
  actualizadoEn: string;
  /** OBS-21: fecha de archivo al completar la entrega; null si sigue activa. */
  archivadaEn: string | null;
  esInterna: boolean;
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

const ETIQUETA_PRIORIDAD: Record<PrioridadOrden, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const CLASE_PRIORIDAD: Record<PrioridadOrden, string> = {
  baja: 'text-texto-secundario',
  normal: 'text-texto-primario',
  alta: 'font-semibold text-amber-700 dark:text-amber-300',
  urgente: 'font-semibold text-red-700 dark:text-red-300',
};

const CLASE_BOTON_SECUNDARIO =
  'rounded-base border border-borde-fuerte px-3 py-1.5 text-sm font-medium transition-colors hover:bg-superficie-2 disabled:cursor-not-allowed disabled:opacity-40';
const CLASE_SELECT =
  'rounded-base border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';

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

/**
 * Una orden solo puede completarse cuando todas sus partidas alcanzaron la
 * cantidad solicitada. PostgreSQL revalida la misma condición como autoridad.
 */
function puedeCompletar(orden: OrdenTabla): boolean {
  return (
    orden.partidas.length > 0 &&
    orden.partidas.every((partida) => partida.cantidadProducida >= partida.cantidadSolicitada)
  );
}

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

/** Días naturales entre hoy y la fecha de compromiso (negativo = vencida). */
function diasParaCompromiso(fechaCompromiso: string): number {
  const compromiso = new Date(fechaCompromiso);
  if (Number.isNaN(compromiso.getTime())) {
    return Number.POSITIVE_INFINITY;
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = new Date(compromiso.getFullYear(), compromiso.getMonth(), compromiso.getDate());
  return Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
}

/** Semáforo de la fecha de compromiso con las utilidades semánticas del sistema. */
function claseCompromiso(dias: number): string {
  if (dias < 0) return 'text-peligro-texto';
  if (dias <= 3) return 'text-advertencia-texto';
  return 'text-texto-secundario';
}

/** Explicación para el `title` del semáforo de compromiso. */
function tituloCompromiso(dias: number, fechaCompromiso: string): string {
  const fecha = formatearFecha(fechaCompromiso);
  if (dias < 0) return `Compromiso vencido hace ${Math.abs(dias)} día(s) — ${fecha}`;
  if (dias === 0) return `Vence hoy — ${fecha}`;
  if (dias <= 3) return `Vence en ${dias} día(s) — ${fecha}`;
  return `Fecha de compromiso: ${fecha}`;
}

/** Tono de la barra de avance según estado y fecha de compromiso. */
function tonoAvance(
  estado: EstadoOrden,
  dias: number,
): 'acento' | 'exito' | 'advertencia' | 'peligro' {
  if (estado === 'completada') return 'exito';
  if (estado === 'pausada') return 'advertencia';
  if (dias < 0) return 'peligro';
  return 'acento';
}

type PropsTablaOrdenes = {
  ordenes: OrdenTabla[];
  ordenInicialId?: string;
  usuarioActualId?: string;
  puedeEliminarTodos?: boolean;
};

/**
 * Tabla de órdenes de producción para el piso: filtra por máquina y estado desde
 * `usarTiendaOrdenes`, marca la orden activa y muestra el avance agregado de cada
 * OP. No consulta datos — recibe la proyección ya resuelta en el servidor y sólo
 * solicita una revalidación inmediata tras sus acciones propias; los cambios
 * de otras estaciones llegan automáticamente mediante Realtime.
 */
export function TablaOrdenes({
  ordenes,
  ordenInicialId,
  usuarioActualId,
  puedeEliminarTodos = false,
}: PropsTablaOrdenes) {
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
  const [ordenCancelando, setOrdenCancelando] = useState<OrdenTabla | null>(null);
  const [ordenEditando, setOrdenEditando] = useState<OrdenTabla | null>(null);
  const [bandeja, setBandeja] = useState<'activas' | 'archivo'>('activas');
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    const marco = requestAnimationFrame(() => setHidratado(true));
    return () => cancelAnimationFrame(marco);
  }, []);

  useEffect(() => {
    if (ordenInicialId && ordenes.some((orden) => orden.id === ordenInicialId)) {
      seleccionarOrden(ordenInicialId);
    }
  }, [ordenInicialId, ordenes, seleccionarOrden]);

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
        const pasaBandeja =
          bandeja === 'archivo' ? orden.archivadaEn !== null : orden.archivadaEn === null;
        const pasaEstado =
          filtrosEstado.length === 0 || filtrosEstado.includes(orden.estado);
        const pasaMaquina =
          filtroMaquina === null ||
          orden.partidas.some((partida) => partida.maquinaAsignada === filtroMaquina);
        return pasaBandeja && pasaEstado && pasaMaquina;
      }),
    [ordenes, filtrosEstado, filtroMaquina, bandeja],
  );

  function alSeleccionarOrden(ordenId: string): void {
    seleccionarOrden(ordenId === ordenActivaId ? null : ordenId);
  }

  function alRefrescar(): void {
    router.refresh();
  }

  async function cambiarEstado(
    orden: OrdenTabla,
    estado: EstadoOrden,
    motivo?: string,
  ): Promise<boolean> {
    setErrorAccion(null);
    setOrdenActualizandoId(orden.id);
    try {
      const respuesta = await cambiarEstadoOrdenAccion({
        ordenId: orden.id,
        estadoActual: orden.estado,
        estado,
        ...(motivo ? { motivoCancelacion: motivo } : {}),
      });
      if (!respuesta.exito) {
        setErrorAccion(respuesta.error);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErrorAccion('No se pudo actualizar la orden. Intenta de nuevo.');
      return false;
    } finally {
      setOrdenActualizandoId(null);
    }
  }

  function abrirCancelacion(orden: OrdenTabla): void {
    setErrorAccion(null);
    setMotivoCancelacion('');
    setOrdenCancelando(orden);
  }

  async function confirmarCancelacion(): Promise<void> {
    if (!ordenCancelando) return;
    const motivo = motivoCancelacion.trim();
    if (motivo.length < 3) {
      setErrorAccion('El motivo de cancelación es obligatorio (mínimo 3 caracteres).');
      return;
    }
    const exito = await cambiarEstado(ordenCancelando, 'cancelada', motivo);
    if (exito) {
      setOrdenCancelando(null);
      setMotivoCancelacion('');
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
            <label htmlFor="filtro-maquina" className="text-xs font-medium text-texto-secundario">
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
            <legend className="text-xs font-medium text-texto-secundario">Estado</legend>
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
                        : 'border-borde-fuerte hover:bg-superficie-2'
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
          <div
            role="tablist"
            aria-label="Bandeja de órdenes"
            className="flex overflow-hidden rounded-base border border-borde-fuerte"
          >
            {(['activas', 'archivo'] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={bandeja === valor}
                data-testid={`bandeja-${valor}`}
                onClick={() => setBandeja(valor)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  bandeja === valor ? 'bg-primario text-white' : 'hover:bg-superficie-2'
                }`}
              >
                {valor === 'activas' ? 'Activas' : 'Archivo'}
              </button>
            ))}
          </div>
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

      {ordenesVisibles.length === 0 ? (
        <EstadoVacio
          titulo={bandeja === 'archivo' ? 'Archivo vacío' : 'Sin órdenes que coincidan'}
          descripcion={
            bandeja === 'archivo'
              ? 'Las órdenes se archivan automáticamente al completar la entrega total.'
              : 'Ninguna orden coincide con la máquina o los estados seleccionados.'
          }
          accion={
            filtroMaquina !== null || filtrosEstado.length > 0 ? (
              <Button variante="contorno" tamano="lg" onClick={limpiarFiltros}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TablaContenedor>
          <Tabla>
            <caption className="sr-only">
              Órdenes de producción con estado, prioridad y avance agregado
            </caption>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Folio</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Prioridad</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Compromiso</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Partidas</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Avance</TablaEncabezadoCelda>
                <TablaEncabezadoCelda className="text-right">Acciones</TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {ordenesVisibles.map((orden) => {
                const avance = calcularAvance(orden.partidas);
                const activa = orden.id === ordenActivaId;
                const dias = diasParaCompromiso(orden.fechaCompromiso);

                return (
                  <TablaFila key={orden.id} seleccionada={activa} aria-selected={activa}>
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 text-left align-middle font-mono text-xs font-medium tabular-nums"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          {orden.folio}
                          {orden.esInterna && (
                            <span
                              className="rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold text-texto-secundario"
                              title="Trabajo interno (TI): no genera cobranza ni cuenta como venta"
                            >
                              TI
                            </span>
                          )}
                        </span>
                        {orden.folioCotizacionCnc && (
                          <span
                            className="font-sans text-[10px] font-normal text-texto-tenue"
                            title="Cotización de origen"
                          >
                            {orden.folioCotizacionCnc}
                          </span>
                        )}
                        {orden.archivadaEn && (
                          <span className="font-sans text-[10px] font-normal text-texto-tenue">
                            Archivada {formatearFecha(orden.archivadaEn)}
                          </span>
                        )}
                      </span>
                    </th>
                    <TablaCelda>
                      <BadgeEstado estado={orden.estado} />
                    </TablaCelda>
                    <TablaCelda className={CLASE_PRIORIDAD[orden.prioridad]}>
                      {ETIQUETA_PRIORIDAD[orden.prioridad]}
                    </TablaCelda>
                    <TablaCelda className={`whitespace-nowrap ${claseCompromiso(dias)}`}>
                      <span title={tituloCompromiso(dias, orden.fechaCompromiso)}>
                        {formatearFecha(orden.fechaCompromiso)}
                      </span>
                    </TablaCelda>
                    <TablaCelda className="whitespace-nowrap text-texto-secundario">
                      {orden.partidas.length}
                      {avance.scrap > 0 && (
                        <span className="ml-2 text-xs text-peligro-texto">
                          {avance.scrap} scrap
                        </span>
                      )}
                    </TablaCelda>
                    <TablaCelda>
                      <div className="flex items-center gap-2">
                        <BarraProgreso
                          valor={avance.porcentaje}
                          tono={tonoAvance(orden.estado, dias)}
                          etiqueta={`Avance de la orden ${orden.folio}`}
                          mostrarPorcentaje
                          className="w-24"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-texto-secundario">
                          {avance.producido}/{avance.solicitado}
                        </span>
                      </div>
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <div className="flex justify-end gap-2">
                        {ACCIONES_RAPIDAS[orden.estado].map((accion) => {
                          const completarBloqueado =
                            accion.estado === 'completada' && !puedeCompletar(orden);
                          return (
                            <button
                              key={accion.estado}
                              type="button"
                              data-testid={`cambiar-estado-${accion.estado}`}
                              onClick={() => void cambiarEstado(orden, accion.estado)}
                              disabled={ordenActualizandoId !== null || completarBloqueado}
                              title={
                                completarBloqueado
                                  ? 'Todas las partidas deben estar producidas para completar la orden'
                                  : undefined
                              }
                              className={CLASE_BOTON_SECUNDARIO}
                            >
                              {ordenActualizandoId === orden.id ? 'Actualizando…' : accion.etiqueta}
                            </button>
                          );
                        })}
                        {orden.estado === 'borrador' && (
                          <button
                            type="button"
                            data-testid={`editar-orden-${orden.folio}`}
                            onClick={() => setOrdenEditando(orden)}
                            disabled={ordenActualizandoId !== null}
                            className={CLASE_BOTON_SECUNDARIO}
                          >
                            Editar
                          </button>
                        )}
                        <DocumentoOrdenBoton ordenId={orden.id} folio={orden.folio} />
                        {orden.estado !== 'completada' && orden.estado !== 'cancelada' && (
                          <button
                            type="button"
                            data-testid="cambiar-estado-cancelada"
                            onClick={() => abrirCancelacion(orden)}
                            disabled={ordenActualizandoId !== null}
                            className={CLASE_BOTON_SECUNDARIO}
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          type="button"
                          aria-pressed={activa}
                          onClick={() => alSeleccionarOrden(orden.id)}
                          className={CLASE_BOTON_SECUNDARIO}
                        >
                          {activa ? 'Quitar selección' : 'Seleccionar'}
                        </button>
                      </div>
                    </TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      {errorAccion && !ordenCancelando && (
        <p role="alert" className="text-sm text-peligro-texto">
          {errorAccion}
        </p>
      )}

      {ordenActivaId && ordenes.some((orden) => orden.id === ordenActivaId) && (
        <div className="rounded-base border border-borde p-4">
          <HiloComentarios
            entidadTipo="orden"
            entidadId={ordenActivaId}
            usuarioActualId={usuarioActualId}
            puedeEliminarTodos={puedeEliminarTodos}
            titulo={`Comentarios de ${ordenes.find((orden) => orden.id === ordenActivaId)?.folio ?? 'la orden'}`}
          />
        </div>
      )}

      <p aria-live="polite" className="text-sm text-texto-secundario">
        {ordenesVisibles.length} de {ordenes.length} orden(es)
      </p>

      {ordenEditando ? (
        <EditarOrdenDialog
          key={`editar-orden-${ordenEditando.id}-${ordenEditando.actualizadoEn}`}
          orden={ordenEditando}
          onCerrar={() => setOrdenEditando(null)}
          onGuardado={alRefrescar}
        />
      ) : null}

      <Dialog open={ordenCancelando !== null} onOpenChange={(abierto) => (!abierto ? setOrdenCancelando(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar orden {ordenCancelando?.folio}</DialogTitle>
            <DialogDescription>
              La cancelación es definitiva. Captura el motivo; quedará en la auditoría.
            </DialogDescription>
          </DialogHeader>
          {errorAccion ? <p role="alert" className="text-sm text-peligro-texto">{errorAccion}</p> : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="motivo-cancelacion-orden">Motivo (mínimo 3 caracteres)</Label>
            <Textarea
              id="motivo-cancelacion-orden"
              value={motivoCancelacion}
              onChange={(evento) => setMotivoCancelacion(evento.target.value)}
              disabled={ordenActualizandoId !== null}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variante="contorno"
              onClick={() => setOrdenCancelando(null)}
              disabled={ordenActualizandoId !== null}
            >
              Volver
            </Button>
            <Button
              type="button"
              onClick={() => void confirmarCancelacion()}
              disabled={ordenActualizandoId !== null || motivoCancelacion.trim().length < 3}
            >
              {ordenActualizandoId !== null ? 'Cancelando…' : 'Confirmar cancelación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
