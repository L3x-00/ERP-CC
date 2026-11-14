'use client';

import { useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { cn } from '@/compartido/utilidades/cn';
import { AccionesTarjetaOrden } from '@/modulos/planeacion/componentes/acciones-tarjeta-orden';
import { InsigniaSaturacion } from '@/modulos/planeacion/componentes/insignia-saturacion';
import { clasificarSaturacion } from '@/modulos/planeacion/servicios/capacidad-servicio';
import type {
  CargaCapacidadDiaria,
  DesglosePartidaPlaneacion,
  EstadoPlaneacion,
  ProgramacionArea,
  RecursoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import {
  etiquetaMaterial,
  etiquetaProcesos,
  formatearDuracionMinutos,
  textoODefecto,
} from '@/modulos/planeacion/utilidades/desglose';
import { formatearHoras } from '@/modulos/planeacion/utilidades/carga-semanal';
import {
  ETIQUETA_ESTADO,
  ETIQUETA_TURNO,
  VARIANTE_ESTADO,
  nivelSemaforo,
  type NivelSemaforo,
} from '@/modulos/planeacion/utilidades/etiquetas';
import { operacionConcluida } from '@/modulos/ordenes/utilidades/conclusion-orden';

/** Tipo de dato del arrastre de programaciones entre días del calendario. */
export const TIPO_ARRASTRE_PROGRAMACION = 'application/x-orca-programacion';

/** Una programación (ítem/operación) con los datos ya resueltos para pintarla. */
export interface ItemOrdenPlaneacion {
  programacion: ProgramacionArea;
  recurso?: RecursoPlaneacion;
  desglose?: DesglosePartidaPlaneacion;
  carga?: CargaCapacidadDiaria;
}

export interface PropsTarjetaOrdenPlaneacion {
  /** Ítems de una misma orden en la fecha de la celda; nunca viene vacío. */
  items: readonly ItemOrdenPlaneacion[];
  programacionSeleccionadaId: string | null;
  compacta?: boolean;
  arrastrable?: boolean;
  onRefrescarOperacion?: () => void;
  onSeleccionar?: (programacion: ProgramacionArea) => void;
}

const GRAVEDAD_NIVEL: Record<NivelSemaforo, number> = {
  disponible: 0,
  'cerca-del-limite': 1,
  saturado: 2,
  sobrecargado: 3,
};

/**
 * C9.1: una orden puede tener muchas operaciones programadas el mismo día. La
 * vista las agrupa en una sola tarjeta por orden y deja cada ítem como fila
 * accionable, para no saturar el calendario con tarjetas idénticas. Programar,
 * reprogramar (arrastre) y las acciones de la orden conservan exactamente el
 * flujo existente: esta pieza sólo cambia la presentación.
 */
export function TarjetaOrdenPlaneacion({
  items,
  programacionSeleccionadaId,
  compacta = false,
  arrastrable = false,
  onRefrescarOperacion,
  onSeleccionar,
}: PropsTarjetaOrdenPlaneacion) {
  const enrutador = useRouter();
  const [resumenAbierto, setResumenAbierto] = useState(false);
  const primero = items[0];
  if (!primero) return null;

  const { programacion: ordenPrincipal, desglose: desglosePrincipal } = primero;
  const ordenId = ordenPrincipal.ordenId;
  const folio = desglosePrincipal?.folio ?? ordenPrincipal.ordenFolio ?? 'Orden';
  const totalHoras = items.reduce((total, item) => total + item.programacion.horasEstimadas, 0);
  const estados = new Set<EstadoPlaneacion>(
    items.map((item) => item.programacion.estadoPlaneacion),
  );
  const estadoUnico = estados.size === 1 ? [...estados][0] : null;
  const saturacionPrincipal = peorSaturacion(items);

  function abrirResumen(): void {
    setResumenAbierto(true);
  }

  return (
    <article
      data-testid={`orden-planeacion-${ordenId}`}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-base border border-borde bg-superficie text-xs',
        compacta ? 'p-2' : 'p-3',
      )}
    >
      <header className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            data-testid={`resumen-orden-${ordenId}`}
            aria-label={`Ver resumen de la orden ${folio}`}
            title={`Ver resumen de la orden ${folio}`}
            onClick={abrirResumen}
            className={cn(
              'min-w-0 truncate rounded-sm text-left font-mono font-semibold underline decoration-dotted underline-offset-2 hover:text-acento focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:outline-none',
              compacta ? 'text-[11px]' : 'text-sm',
            )}
          >
            {folio}
          </button>
          <Badge variante="neutro" className="shrink-0">
            {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
          </Badge>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p
            className="min-w-0 truncate text-[11px] text-texto-secundario"
            title={desglosePrincipal?.descripcion ?? undefined}
          >
            {desglosePrincipal
              ? `${desglosePrincipal.codigoPieza} · ${textoODefecto(desglosePrincipal.descripcion)}`
              : 'Partida'}
          </p>
          <span className="shrink-0 whitespace-nowrap text-[10px] text-texto-secundario">
            P{ordenPrincipal.ordenPrioridad} · {formatearHoras(totalHoras)} h
          </span>
        </div>
        {!compacta || estadoUnico === null || (saturacionPrincipal && saturacionPrincipal.nivel !== 'disponible') ? (
          <div className="flex flex-wrap items-center gap-1">
            {!compacta || estadoUnico === null ? (
              estadoUnico ? (
                <Badge variante={VARIANTE_ESTADO[estadoUnico]} className="shrink-0">
                  {ETIQUETA_ESTADO[estadoUnico]}
                </Badge>
              ) : (
                <Badge variante="neutro" className="shrink-0">
                  {estados.size} estados
                </Badge>
              )
            ) : null}
            {saturacionPrincipal && (!compacta || saturacionPrincipal.nivel !== 'disponible') ? (
              <InsigniaSaturacion
                nivel={saturacionPrincipal.nivel}
                horasProgramadas={saturacionPrincipal.carga.horasProgramadas}
                horasCapacidad={saturacionPrincipal.carga.horasCapacidad}
                variante={compacta ? 'celda' : 'completa'}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <FilaItemOrden
            key={item.programacion.id}
            item={item}
            seleccionada={item.programacion.id === programacionSeleccionadaId}
            compacta={compacta}
            arrastrable={arrastrable}
            onSeleccionar={onSeleccionar}
          />
        ))}
      </ul>

      {!compacta && onRefrescarOperacion ? (
        <AccionesTarjetaOrden programacion={ordenPrincipal} onRefrescar={onRefrescarOperacion} />
      ) : null}

      {!compacta && arrastrable ? (
        <p className="text-[11px] text-texto-secundario">
          Arrastra un ítem a otro día para reprogramarlo con confirmación.
        </p>
      ) : null}

      <Dialog open={resumenAbierto} onOpenChange={setResumenAbierto}>
        <DialogContent data-testid="resumen-orden-planeacion">
          <DialogHeader>
            <DialogTitle>Orden {folio}</DialogTitle>
            <DialogDescription>
              Resumen rápido de la programación. La ficha completa abre en Órdenes.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <div className="col-span-2">
              <dt className="text-texto-secundario">Pieza</dt>
              <dd>
                {desglosePrincipal
                  ? `${desglosePrincipal.codigoPieza} · ${textoODefecto(desglosePrincipal.descripcion)}`
                  : 'Partida'}
              </dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Ítems programados</dt>
              <dd>{items.length}</dd>
            </div>
            <div>
              <dt className="text-texto-secundario">Horas estimadas</dt>
              <dd>{formatearHoras(totalHoras)} h</dd>
            </div>
            {desglosePrincipal ? (
              <>
                <div>
                  <dt className="text-texto-secundario">Material</dt>
                  <dd>{etiquetaMaterial(desglosePrincipal)}</dd>
                </div>
                <div>
                  <dt className="text-texto-secundario">Procesos</dt>
                  <dd>{etiquetaProcesos(desglosePrincipal)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-texto-secundario">Tiempo estimado de la pieza</dt>
                  <dd>{formatearDuracionMinutos(desglosePrincipal.tiempoEstimadoMinutos)}</dd>
                </div>
              </>
            ) : null}
            <div className="col-span-2">
              <dt className="text-texto-secundario">Programación visible</dt>
              <dd>
                {items
                  .map((item) => {
                    const operacion = item.programacion.operacionNombre
                      ? `${item.programacion.secuencia}. ${item.programacion.operacionNombre}`
                      : `Ítem ${textoODefecto(item.desglose?.codigoItem)}`;
                    return `${operacion} · ${item.programacion.fechaProgramada} · ${ETIQUETA_TURNO[item.programacion.turno]} · ${item.programacion.horasEstimadas} h`;
                  })
                  .join(' | ')}
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button type="button" variante="contorno" onClick={() => setResumenAbierto(false)}>
              Cerrar
            </Button>
            <Button
              type="button"
              data-testid={`abrir-orden-${ordenId}`}
              onClick={() => enrutador.push(`/ordenes?ordenId=${ordenId}`)}
            >
              Abrir orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function FilaItemOrden({
  item,
  seleccionada,
  compacta,
  arrastrable,
  onSeleccionar,
}: {
  item: ItemOrdenPlaneacion;
  seleccionada: boolean;
  compacta: boolean;
  arrastrable: boolean;
  onSeleccionar?: (programacion: ProgramacionArea) => void;
}) {
  const { programacion, recurso, desglose } = item;
  const concluida = operacionConcluida(programacion);
  const puedeArrastrar = arrastrable && !concluida;
  const itemTexto = desglose ? textoODefecto(desglose.codigoItem) : textoODefecto(null);
  const procesosTexto = desglose ? etiquetaProcesos(desglose) : textoODefecto(null);
  const operacionTexto = programacion.operacionNombre
    ? `${programacion.secuencia}. ${programacion.operacionNombre}`
    : `Ítem ${itemTexto}`;
  const recursoTexto = recurso
    ? `${recurso.codigo}${recurso.grupoEquipoNombre ? ` · ${recurso.grupoEquipoNombre}` : ''}`
    : 'Recurso por definir';

  function iniciarArrastre(evento: DragEvent<HTMLElement>): void {
    if (!puedeArrastrar) return;
    evento.dataTransfer.setData(TIPO_ARRASTRE_PROGRAMACION, programacion.id);
    evento.dataTransfer.setData('text/plain', programacion.id);
    evento.dataTransfer.effectAllowed = 'move';
  }

  function seleccionar(): void {
    onSeleccionar?.(programacion);
  }

  function alTeclear(evento: KeyboardEvent<HTMLLIElement>): void {
    if (!onSeleccionar) return;
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    evento.preventDefault();
    seleccionar();
  }

  return (
    <li
      data-testid={`programacion-${programacion.id}`}
      data-seleccionada={seleccionada ? 'si' : 'no'}
      draggable={puedeArrastrar}
      onDragStart={puedeArrastrar ? iniciarArrastre : undefined}
      onClick={onSeleccionar ? seleccionar : undefined}
      onKeyDown={onSeleccionar ? alTeclear : undefined}
      role={onSeleccionar ? 'button' : undefined}
      tabIndex={onSeleccionar ? 0 : undefined}
      aria-label={`${concluida ? 'Ver detalle' : 'Programar'} ${operacionTexto} de la orden ${desglose?.folio ?? programacion.ordenFolio ?? ''}`}
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-sm border px-2 py-1.5 transition-colors',
        seleccionada
          ? 'border-acento bg-superficie-2'
          : 'border-borde bg-superficie-2/40 hover:border-acento/50 hover:bg-acento-suave/20',
        onSeleccionar
          ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:outline-none'
          : null,
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          {puedeArrastrar ? (
            <span
              data-testid={`asa-arrastre-${programacion.id}`}
              draggable
              onDragStart={iniciarArrastre}
              title="Arrastrar para reprogramar este ítem"
              aria-hidden="true"
              className="-ml-0.5 mt-0.5 shrink-0 cursor-grab select-none text-sm leading-none text-texto-tenue active:cursor-grabbing"
            >
              ⠿
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <p
              className="truncate text-[11px] font-medium text-texto-primario"
              title={`Operación ${programacion.secuencia}${programacion.operacionNombre ? ` · ${programacion.operacionNombre}` : ''}`}
            >
              {operacionTexto}
            </p>
            <p
              className="truncate text-[10px] leading-4 text-texto-secundario"
              title={`Ítem ${itemTexto} · ${recursoTexto} · ${programacion.horasEstimadas} h`}
            >
              {programacion.operacionNombre ? `Ítem ${itemTexto}` : `Procesos: ${procesosTexto}`}
              {programacion.operacionNombre && desglose ? ` · ${desglose.codigoPieza}` : ''}
              {' · '}{recursoTexto}{' · '}{ETIQUETA_TURNO[programacion.turno]}{' · '}
              {programacion.horasEstimadas} h
            </p>
            {!compacta && desglose?.descripcion ? (
              <p className="truncate text-[10px] text-texto-secundario">{desglose.descripcion}</p>
            ) : null}
          </div>
        </div>
        <Badge
          variante={VARIANTE_ESTADO[programacion.estadoPlaneacion]}
          className="shrink-0 px-1.5 py-0 text-[9px] leading-4"
        >
          {ETIQUETA_ESTADO[programacion.estadoPlaneacion]}
        </Badge>
      </div>
    </li>
  );
}

function peorSaturacion(
  items: readonly ItemOrdenPlaneacion[],
): { nivel: NivelSemaforo; carga: CargaCapacidadDiaria } | null {
  let peor: { nivel: NivelSemaforo; carga: CargaCapacidadDiaria } | null = null;
  const vistas = new Set<string>();
  for (const { programacion, carga } of items) {
    if (!carga) continue;
    const clave = `${programacion.recursoId}:${programacion.fechaProgramada}:${programacion.turno}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const nivel = nivelSemaforo(clasificarSaturacion(carga.horasCapacidad, carga.horasProgramadas));
    if (!peor || GRAVEDAD_NIVEL[nivel] > GRAVEDAD_NIVEL[peor.nivel]) {
      peor = { nivel, carga };
    }
  }
  return peor;
}
