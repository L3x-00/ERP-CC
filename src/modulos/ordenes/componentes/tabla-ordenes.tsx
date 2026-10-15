'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
import { Button } from '@/compartido/componentes/ui/button';
import { usarTiendaOrdenes } from '@/estado/uso-tienda-ordenes';
import { liberarOrdenAccion } from '@/modulos/ordenes/acciones/liberar-orden';
import {
  ESTADOS_SII_ORDEN,
  type EstadoSiiOrden,
} from '@/modulos/ordenes/tipos/orden-sii';
import {
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
  metasProceso: { id: string; secuencia: number; nombre: string; metaPiezas: number }[];
};

/** Orden tal como la necesita la tabla (proyección plana del servidor). */
export type OrdenTabla = {
  id: string;
  folio: string;
  /** SII-B5.2: folio nuevo O-/OI-; null en históricos. */
  folioSii: string | null;
  /** RFQ-10: folio comercial (CNC-…) de la cotización de origen, si es visible. */
  folioCotizacionCnc: string | null;
  estado: EstadoOrden;
  /** SII-B5.3: estado derivado del avance. */
  estadoSii: EstadoSiiOrden;
  prioridad: PrioridadOrden;
  fechaCompromiso: string;
  /** Token de versión (ORD-05/B5) para acciones con compare-and-set. */
  actualizadoEn: string;
  /** OBS-21: fecha de archivo al completar la entrega; null si sigue activa. */
  archivadaEn: string | null;
  esInterna: boolean;
  /** ORD-06: ID del sistema anterior; null en órdenes del flujo actual. */
  idHistorico: string | null;
  partidas: PartidaTabla[];
};

const ETIQUETA_ESTADO_SII: Record<EstadoSiiOrden, string> = {
  CONFIRMADA: 'Confirmada',
  PLANIFICADA: 'Planificada',
  LISTA: 'Lista',
  EN_PRODUCCION: 'En producción',
  PRODUCCION_COMPLETADA: 'Producción completada',
  CERRADA: 'Cerrada',
  CANCELADA: 'Cancelada',
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
  if (dias < 0) return `Compromiso vencido hace ${Math.abs(dias)} días — ${fecha}`;
  if (dias === 0) return `Vence hoy — ${fecha}`;
  if (dias <= 3) return `Vence en ${dias} día(s) — ${fecha}`;
  return `Fecha de compromiso: ${fecha}`;
}

/** Tono de la barra de avance según estado SII y fecha de compromiso. */
function tonoAvance(
  estadoSii: EstadoSiiOrden,
  dias: number,
): 'acento' | 'exito' | 'advertencia' | 'peligro' {
  if (estadoSii === 'PRODUCCION_COMPLETADA' || estadoSii === 'CERRADA') return 'exito';
  if (estadoSii === 'CANCELADA') return 'advertencia';
  if (dias < 0) return 'peligro';
  return 'acento';
}

type PropsTablaOrdenes = {
  ordenes: OrdenTabla[];
  ordenInicialId?: string;
  usuarioActualId?: string;
  puedeEliminarTodos?: boolean;
  puedeAdministrar?: boolean;
  puedeLiberar?: boolean;
  puedeCerrar?: boolean;
  puedeCancelar?: boolean;
  puedeVerFinanzas?: boolean;
};

/**
 * Cola de órdenes de producción (estados SII-B5): responde «qué necesita atención».
 * Filtra por máquina y estado, muestra el avance agregado y ofrece Abrir (la ficha es
 * el destino de Comentarios, Adjuntos, Cancelar, Cerrar y Documento) y una sola acción
 * contextual: Liberar. El estado deriva de la programación, las sesiones y las metas.
 */
export function TablaOrdenes({
  ordenes,
  ordenInicialId,
  puedeLiberar = false,
}: PropsTablaOrdenes) {
  const router = useRouter();
  const filtroMaquina = usarTiendaOrdenes((estado) => estado.filtroMaquina);
  const filtrosEstado = usarTiendaOrdenes((estado) => estado.filtrosEstado);
  const establecerFiltroMaquina = usarTiendaOrdenes((estado) => estado.establecerFiltroMaquina);
  const alternarFiltroEstado = usarTiendaOrdenes((estado) => estado.alternarFiltroEstado);
  const limpiarFiltros = usarTiendaOrdenes((estado) => estado.limpiarFiltros);
  const [ordenActualizandoId, setOrdenActualizandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [mensajeAccion, setMensajeAccion] = useState<string | null>(null);
  const [bandeja, setBandeja] = useState<'activas' | 'archivo'>(() =>
    ordenInicialId && ordenes.find((orden) => orden.id === ordenInicialId)?.archivadaEn
      ? 'archivo' : 'activas');
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
        const pasaBandeja =
          bandeja === 'archivo' ? orden.archivadaEn !== null : orden.archivadaEn === null;
        const pasaEstado =
          filtrosEstado.length === 0 || filtrosEstado.includes(orden.estadoSii);
        const pasaMaquina =
          filtroMaquina === null ||
          orden.partidas.some((partida) => partida.maquinaAsignada === filtroMaquina);
        return pasaBandeja && pasaEstado && pasaMaquina;
      }),
    [ordenes, filtrosEstado, filtroMaquina, bandeja],
  );

  function alRefrescar(): void {
    router.refresh();
  }

  function limpiarMensajes(): void {
    setErrorAccion(null);
    setMensajeAccion(null);
  }

  async function liberar(orden: OrdenTabla): Promise<void> {
    limpiarMensajes();
    setOrdenActualizandoId(orden.id);
    try {
      const respuesta = await liberarOrdenAccion({
        ordenId: orden.id,
        actualizadoEn: orden.actualizadoEn,
      });
      if (!respuesta.exito) {
        setErrorAccion(respuesta.error);
        return;
      }
      setMensajeAccion(`Orden ${orden.folioSii ?? orden.folio} liberada a producción`);
      router.refresh();
    } catch {
      setErrorAccion('No se pudo liberar la orden. Intenta de nuevo.');
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
              {ESTADOS_SII_ORDEN.map((estado) => {
                const activo = filtrosEstado.includes(estado);
                return (
                  <button
                    key={estado}
                    type="button"
                    aria-pressed={activo}
                    data-testid={`chip-estado-${estado}`}
                    onClick={() => alternarFiltroEstado(estado)}
                    className={`rounded-base border px-2.5 py-1 text-xs font-medium transition-colors ${
                      activo
                        ? 'border-primario bg-primario text-white'
                        : 'border-borde-fuerte hover:bg-superficie-2'
                    }`}
                  >
                    {ETIQUETA_ESTADO_SII[estado]}
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
                const dias = diasParaCompromiso(orden.fechaCompromiso);
                const folioVisible = orden.folioSii ?? orden.folio;

                return (
                  <TablaFila
                    key={orden.id}
                    data-testid={`fila-orden-${folioVisible}`}
                  >
                    <th
                      scope="row"
                      className="whitespace-nowrap px-4 py-3 text-left align-middle font-mono text-xs font-medium tabular-nums"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1.5">
                          {folioVisible}
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
                      <span data-testid={`estado-orden-${folioVisible}`}>
                        <BadgeEstado estado={orden.estadoSii} />
                      </span>
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
                          tono={tonoAvance(orden.estadoSii, dias)}
                          etiqueta={`Avance de la orden ${folioVisible}`}
                          mostrarPorcentaje
                          className="w-24"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-texto-secundario">
                          {avance.producido}/{avance.solicitado}
                        </span>
                      </div>
                    </TablaCelda>
                    <TablaCelda className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/ordenes/${orden.id}`}
                          data-testid={`abrir-ficha-${folioVisible}`}
                          className={CLASE_BOTON_SECUNDARIO}
                        >
                          Abrir
                        </Link>
                        {puedeLiberar && orden.estadoSii === 'PLANIFICADA' && (
                          <button
                            type="button"
                            data-testid={`liberar-orden-${folioVisible}`}
                            onClick={() => void liberar(orden)}
                            disabled={ordenActualizandoId !== null}
                            className={CLASE_BOTON_SECUNDARIO}
                            title="Libera la orden a producción validando programación, ruteo y archivos vivos"
                          >
                            {ordenActualizandoId === orden.id ? 'Liberando…' : 'Liberar'}
                          </button>
                        )}
                      </div>
                    </TablaCelda>
                  </TablaFila>
                );
              })}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      {errorAccion && (
        <p role="alert" className="text-sm text-peligro-texto" data-testid="ordenes-error">
          {errorAccion}
        </p>
      )}
      {mensajeAccion && (
        <p role="status" className="text-sm text-exito-texto" data-testid="ordenes-mensaje">
          {mensajeAccion}
        </p>
      )}

      <p aria-live="polite" className="text-sm text-texto-secundario">
        {ordenesVisibles.length} de {ordenes.length} orden(es)
      </p>
    </div>
  );
}
