'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import { cn } from '@/compartido/utilidades/cn';
import { ContadorSesionVivo } from '@/modulos/produccion/componentes/contador-sesion-vivo';
import {
  ETIQUETAS_COLUMNA,
  ETIQUETAS_URGENCIA,
  etiquetaMotivoPausa,
  procesoRepresentativoItem,
  type GrupoOrdenEspacioOperador,
  type ProcesoEspacioOperador,
  type UrgenciaProceso,
} from '@/modulos/produccion/tipos/indice';
import {
  etiquetaDiaCorto,
  etiquetaFechaHora,
  horasLegibles,
  textoCompromiso,
} from '@/modulos/produccion/utilidades/formato-operador';

const BORDE_URGENCIA: Record<UrgenciaProceso, string> = {
  vencida: 'border-l-peligro',
  urgente: 'border-l-peligro',
  proxima: 'border-l-advertencia',
  normal: 'border-l-borde',
};

const VARIANTE_URGENCIA = {
  vencida: 'peligro',
  urgente: 'peligro',
  proxima: 'alerta',
  normal: 'neutro',
} as const;

export interface PropsTarjetaOrdenOperador {
  grupo: GrupoOrdenEspacioOperador;
  hoy: string;
  arrastrable?: boolean;
  /** Réplica de una orden en una columna secundaria: misma información y acciones. */
  compacta?: boolean;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAbrirOrden: (ordenId: string) => void;
  /** C15: reanuda una sesión pausada directamente desde la tarjeta. */
  onReanudar?: (proceso: ProcesoEspacioOperador) => void;
  /** C15: cierra la pausa sin producir y libera la operación al pool. */
  onCerrarPausa?: (proceso: ProcesoEspacioOperador) => void;
  /** C20: declara avance y hora real de una pausa automática por jornada. */
  onActualizarAvance?: (proceso: ProcesoEspacioOperador) => void;
}

function rutaDeItem(grupo: GrupoOrdenEspacioOperador, indice: number): string {
  const item = grupo.items[indice];
  const representante = item ? procesoRepresentativoItem(item) : null;
  if (representante?.procesosRuteo.length) {
    return representante.procesosRuteo
      .map((paso, posicion) => `${posicion + 1}. ${paso.nombre}`)
      .join(' → ');
  }
  return (item?.procesos ?? [])
    .map((paso, posicion) => `${posicion + 1}. ${paso.procesoNombre}`)
    .join(' → ');
}

/**
 * Tarjeta de orden para el piso: la orden viaja completa y cada ítem es
 * clickeable. El detalle de procesos y las acciones viven en el modal, no en
 * la tarjeta. Así una orden con muchos ítems no se convierte en muchas tarjetas.
 */
export function TarjetaOrdenOperador(props: PropsTarjetaOrdenOperador) {
  if (props.compacta) return <TarjetaOrdenOperadorCompacta {...props} />;
  return <TarjetaOrdenOperadorCompleta {...props} />;
}

function TarjetaOrdenOperadorCompleta({
  grupo,
  hoy,
  arrastrable = false,
  onAbrir,
  onAbrirOrden,
  onReanudar,
  onCerrarPausa,
  onActualizarAvance,
}: PropsTarjetaOrdenOperador) {
  return (
    <article
      className={cn(
        'relative flex min-w-0 flex-col gap-2 rounded-lg border border-l-4 border-borde bg-superficie p-3 text-left shadow-sm',
        BORDE_URGENCIA[grupo.urgencia],
      )}
      data-testid={`orden-operador-${grupo.ordenId}`}
      aria-label={`${grupo.folioOrden} · ${grupo.clienteNombre} · ${grupo.items.length} ítems`}
    >
      <button
        type="button"
        onClick={() => onAbrirOrden(grupo.ordenId)}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
        aria-label={`Abrir detalle general de la orden ${grupo.folioOrden}`}
        data-testid={`abrir-orden-operador-${grupo.ordenId}`}
      />
      <header className="pointer-events-none relative z-10 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-texto-primario">
              {grupo.folioOrden}
              {grupo.folioSii && grupo.folioSii !== grupo.folioOrden ? (
                <span className="ml-1 font-sans text-xs font-normal text-texto-tenue">
                  · {grupo.folioSii}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-texto-secundario">{grupo.clienteNombre}</p>
          </div>
          <Badge variante={VARIANTE_URGENCIA[grupo.urgencia]}>
            {ETIQUETAS_URGENCIA[grupo.urgencia]}
          </Badge>
        </div>
        <p className="text-[11px] text-texto-secundario">
          Compromiso:{' '}
          <span className="whitespace-nowrap">
            {etiquetaDiaCorto(grupo.fechaCompromiso)} · {textoCompromiso(grupo.fechaCompromiso, hoy)}
          </span>
        </p>
        <BarraProgreso
          valor={grupo.porcentaje}
          etiqueta={`Avance de ${grupo.folioOrden}`}
          mostrarPorcentaje
        />
      </header>

      <ul className="pointer-events-none relative z-10 flex flex-col gap-1.5">
        {grupo.items.map((item, indice) => {
          const representante = procesoRepresentativoItem(item);
          const ruta = rutaDeItem(grupo, indice);
          const estadoDistinto = representante.columna !== grupo.columna;
          const tieneAviso = representante.etiquetas.includes('Sin piezas previas');
          const sesionPausada = (representante.columna === 'pausada'
            || representante.columna === 'actualizar_avance')
            && representante.ultimaSesion?.estadoSesion === 'pausada'
            ? representante.ultimaSesion
            : null;
          return (
            <li
              key={item.partidaId}
              className="pointer-events-auto relative rounded-md border border-borde bg-superficie-2/30 p-2 transition-colors hover:border-acento/50 hover:bg-superficie-2/60"
              data-testid={`proceso-${representante.id}`}
              aria-label={`Abrir ${item.codigoPieza} de ${grupo.folioOrden}`}
              draggable={arrastrable}
              onDragStart={(evento) => {
                if (!arrastrable) {
                  evento.preventDefault();
                  return;
                }
                evento.dataTransfer.setData('text/plain', representante.id);
                evento.dataTransfer.effectAllowed = 'move';
              }}
            >
              <button
                type="button"
                draggable={false}
                onClick={() => onAbrir(representante)}
                className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                aria-label={`Abrir detalle de ${item.codigoPieza} de ${grupo.folioOrden}`}
                data-testid={`abrir-detalle-${representante.id}`}
              />
              <div className="pointer-events-none relative z-10 flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-texto-primario" title={item.descripcion ?? item.codigoPieza}>
                    {item.codigoPieza}
                    {item.descripcion ? (
                      <span className="font-normal text-texto-secundario"> · {item.descripcion}</span>
                    ) : null}
                  </p>
                  <p className="shrink-0 text-right text-[11px] tabular-nums text-texto-secundario">
                    {formatearNumero(item.cantidadProducida, 0)}/{formatearNumero(item.cantidadSolicitada, 0)}{' '}
                    {item.unidadMedida} · {Math.round(item.porcentaje)}%
                  </p>
                </div>
                <p className="truncate text-[10px] text-texto-tenue" title={ruta}>
                  {ruta}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-texto-tenue">
                  <span>{horasLegibles(representante.horasEstimadas)}</span>
                  {representante.sesionActiva ? (
                    <ContadorSesionVivo
                      fechaInicio={representante.sesionActiva.fechaInicio}
                      limiteHoras={representante.horasEstimadas}
                      testId={`contador-sesion-${representante.id}`}
                      mostrarLimite={false}
                    />
                  ) : null}
                  {/* M7: la etiqueta nombra la operación, no el área del recurso. */}
                  <span>· {representante.procesoNombre || representante.areaNombre}</span>
                  {estadoDistinto ? (
                    <Badge variante="info">{ETIQUETAS_COLUMNA[representante.columna]}</Badge>
                  ) : null}
                  {representante.corridaReferencia ? (
                    <Badge
                      variante={representante.corridaReferencia.estado === 'COMPLETADA' ? 'exito' : 'info'}
                      data-testid={`corrida-item-${representante.id}`}
                    >
                      {representante.corridaReferencia.estado === 'COMPLETADA'
                        ? `Trabajado en lote ${representante.corridaReferencia.codigo}`
                        : `En lote ${representante.corridaReferencia.codigo}`}
                    </Badge>
                  ) : null}
                  {tieneAviso ? <Badge variante="alerta">Sin piezas previas</Badge> : null}
                  {representante.reclamo ? (
                    <span className={representante.reclamadoPorMi ? 'text-exito-texto' : 'text-advertencia-texto'}>
                      {representante.reclamadoPorMi
                        ? 'Reservado por ti'
                        : `Tomado por ${representante.nombreReclamante ?? 'otro operador'}`}
                    </span>
                  ) : null}
                  <span className="ml-auto font-medium text-acento-texto">Ver detalle ›</span>
                </div>
                {sesionPausada ? (
                  <div
                    className="pointer-events-auto mt-1 grid gap-1 rounded-md border border-advertencia/40 bg-advertencia-suave/70 p-2 text-[10px] text-advertencia-texto"
                    data-testid={`pausa-proceso-${representante.id}`}
                  >
                    <p className="font-semibold">
                      {etiquetaMotivoPausa(sesionPausada.motivoPausa) ?? 'Sesión pausada'}
                      {representante.pendienteActualizacionAvance ? ' · avance pendiente' : ''}
                    </p>
                    <p>
                      {sesionPausada.operadorNombre}
                      {sesionPausada.fechaFin
                        ? ` · ${etiquetaFechaHora(sesionPausada.fechaFin)}`
                        : ''}
                      {` · ${horasLegibles(sesionPausada.horasNetas)} netas`}
                    </p>
                    {sesionPausada.motivoPausaNota ? (
                      <p className="line-clamp-2 text-texto-secundario">
                        {sesionPausada.motivoPausaNota}
                      </p>
                    ) : null}
                    {representante.reclamadoPorMi
                      && (representante.puedeReanudar || representante.pendienteActualizacionAvance)
                      && (onReanudar || onCerrarPausa || onActualizarAvance) ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {representante.pendienteActualizacionAvance && onActualizarAvance ? (
                          <Button
                            type="button"
                            tamano="sm"
                            variante="secundario"
                            draggable={false}
                            onClick={() => onActualizarAvance(representante)}
                            data-testid={`actualizar-avance-proceso-${representante.id}`}
                          >
                            Actualizar avance
                          </Button>
                        ) : null}
                        {!representante.pendienteActualizacionAvance && onReanudar ? (
                          <Button
                            type="button"
                            tamano="sm"
                            variante="secundario"
                            draggable={false}
                            onClick={() => onReanudar(representante)}
                            data-testid={`reanudar-proceso-${representante.id}`}
                          >
                            Continuar sesión
                          </Button>
                        ) : null}
                        {!representante.pendienteActualizacionAvance && onCerrarPausa ? (
                          <Button
                            type="button"
                            tamano="sm"
                            variante="contorno"
                            draggable={false}
                            onClick={() => onCerrarPausa(representante)}
                            data-testid={`cerrar-pausa-proceso-${representante.id}`}
                          >
                            Cerrar pausa
                          </Button>
                        ) : null}
                      </div>
                    ) : representante.reclamadoPorMi
                      && !representante.puedeReanudar
                      && !representante.pendienteActualizacionAvance ? (
                      <p className="text-[10px] text-texto-secundario">
                        Periodo cerrado: conserva sus horas y no requiere cierre.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/**
 * Réplica compacta en una columna secundaria. Conserva la orden, su operación
 * y las mismas acciones (C15): solo cambia el tamaño visual.
 */
function TarjetaOrdenOperadorCompacta({
  grupo,
  onAbrir,
  onAbrirOrden,
  onReanudar,
  onCerrarPausa,
  onActualizarAvance,
}: PropsTarjetaOrdenOperador) {
  const item = grupo.items[0];
  const representante = item ? procesoRepresentativoItem(item) : null;
  const sesionPausada = representante
    && (representante.columna === 'pausada' || representante.columna === 'actualizar_avance')
    && representante.ultimaSesion?.estadoSesion === 'pausada'
    ? representante.ultimaSesion
    : null;

  return (
    <article
      className="relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-l-4 border-borde border-l-info/60 bg-superficie/70 p-2 text-left"
      data-testid={`orden-operador-${grupo.ordenId}`}
      data-vista="compacta"
      aria-label={`${grupo.folioOrden} · operación en ${ETIQUETAS_COLUMNA[grupo.columna]}`}
    >
      <button
        type="button"
        onClick={() => onAbrirOrden(grupo.ordenId)}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
        aria-label={`Abrir detalle general de la orden ${grupo.folioOrden}`}
        data-testid={`abrir-orden-operador-${grupo.ordenId}`}
      />
      <div className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-1">
        <p className="truncate font-mono text-xs font-semibold text-texto-primario">
          {grupo.folioOrden}
        </p>
        <Badge variante="info">{ETIQUETAS_COLUMNA[grupo.columna]}</Badge>
      </div>
      {representante ? (
        <div
          className="pointer-events-auto relative z-10 rounded-md border border-borde bg-superficie-2/50 p-1.5"
          data-testid={`proceso-${representante.id}`}
        >
          <button
            type="button"
            onClick={() => onAbrir(representante)}
            className="absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
            aria-label={`Abrir detalle de ${item!.codigoPieza} de ${grupo.folioOrden}`}
            data-testid={`abrir-detalle-${representante.id}`}
          />
          <p className="pointer-events-none relative z-10 truncate text-[11px] font-medium text-texto-primario">
            {item!.codigoPieza} · {representante.procesoNombre}
          </p>
          {representante.corridaReferencia ? (
            <p
              className="pointer-events-none relative z-10 text-[10px] text-texto-secundario"
              data-testid={`corrida-item-${representante.id}`}
            >
              {representante.corridaReferencia.estado === 'COMPLETADA' ? 'Trabajado en lote ' : 'En lote '}
              {representante.corridaReferencia.codigo}
            </p>
          ) : null}
          {sesionPausada ? (
            <div
              className="pointer-events-auto relative z-10 mt-1 rounded border border-advertencia/40 bg-advertencia-suave/70 p-1 text-[10px] text-advertencia-texto"
              data-testid={`pausa-proceso-${representante.id}`}
            >
              <p className="font-semibold">
                {etiquetaMotivoPausa(sesionPausada.motivoPausa) ?? 'Sesión pausada'}
              </p>
              <p className="text-texto-secundario">
                {sesionPausada.operadorNombre}
                {sesionPausada.fechaFin
                  ? ` · ${etiquetaFechaHora(sesionPausada.fechaFin)}`
                  : ''}
              </p>
              {representante.reclamadoPorMi
                && (representante.puedeReanudar || representante.pendienteActualizacionAvance)
                && (onReanudar || onCerrarPausa || onActualizarAvance) ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {representante.pendienteActualizacionAvance && onActualizarAvance ? (
                    <Button
                      type="button"
                      tamano="sm"
                      variante="secundario"
                      onClick={() => onActualizarAvance(representante)}
                      data-testid={`actualizar-avance-proceso-${representante.id}`}
                    >
                      Actualizar avance
                    </Button>
                  ) : null}
                  {!representante.pendienteActualizacionAvance && onReanudar ? (
                    <Button
                      type="button"
                      tamano="sm"
                      variante="secundario"
                      onClick={() => onReanudar(representante)}
                      data-testid={`reanudar-proceso-${representante.id}`}
                    >
                      Continuar sesión
                    </Button>
                  ) : null}
                  {!representante.pendienteActualizacionAvance && onCerrarPausa ? (
                    <Button
                      type="button"
                      tamano="sm"
                      variante="contorno"
                      onClick={() => onCerrarPausa(representante)}
                      data-testid={`cerrar-pausa-proceso-${representante.id}`}
                    >
                      Cerrar pausa
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
