'use client';

import { BadgeEstado, type TonoEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Badge } from '@/compartido/componentes/ui/badge';
import { horasLegibles, textoCompromiso } from '@/modulos/produccion/utilidades/formato-operador';
import { verboProceso } from '@/modulos/produccion/utilidades/procesos';
import type { MiProceso, EstadoMiProceso } from '@/modulos/produccion/utilidades/mi-panel-operador';
import type { GrupoOrdenEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

/**
 * Tono y etiqueta por estado del proceso. `EstadoMiProceso` no coincide uno a
 * uno con el catálogo global (`pausado`/`terminado` no están catalogados), por
 * eso se fijan aquí para conservar el significado visual del panel.
 */
const PRESENTACION_ESTADO: Record<EstadoMiProceso, { etiqueta: string; tono: TonoEstado }> = {
  en_proceso: { etiqueta: 'En proceso', tono: 'info' },
  pausado: { etiqueta: 'Pausado', tono: 'advertencia' },
  pendiente: { etiqueta: 'Pendiente', tono: 'neutro' },
  terminado: { etiqueta: 'Terminado', tono: 'exito' },
};

const VARIANTE_URGENCIA = {
  vencida: 'peligro',
  urgente: 'peligro',
  proxima: 'alerta',
  normal: 'neutro',
} as const;

export interface PropsTarjetaOrdenMisProcesos {
  grupo: GrupoOrdenEspacioOperador;
  procesos: readonly MiProceso[];
  hoy: string;
  procesando: string | null;
  onIniciar: (proceso: MiProceso['proceso']) => void;
  onReanudar: (proceso: MiProceso['proceso']) => void;
  onLiberar: (proceso: MiProceso['proceso']) => void;
  onGestionar: (proceso: MiProceso['proceso']) => void;
}

/**
 * Punto 10: «Mis procesos» muestra una tarjeta por orden. Antes cada operación
 * era una tarjeta independiente y una orden con varias partidas o procesos
 * repetía folio, cliente y avance. La tarjeta conserva el flujo por proceso
 * (estado, métricas y acciones) sin duplicar la identidad de la orden.
 *
 * Presentación compacta: una fila por proceso con métricas en línea, barra de
 * avance fina y acciones reducidas. Reduce el alto de la vista sin cambiar la
 * lógica de disponibilidad ni las acciones disponibles.
 */
export function TarjetaOrdenMisProcesos({
  grupo,
  procesos,
  hoy,
  procesando,
  onIniciar,
  onReanudar,
  onLiberar,
  onGestionar,
}: PropsTarjetaOrdenMisProcesos) {
  return (
    <article
      className="flex min-w-0 flex-col rounded-lg border border-borde bg-superficie shadow-sm transition-shadow hover:shadow-md"
      data-testid={`mis-procesos-orden-${grupo.ordenId}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-borde px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate font-mono text-sm font-semibold text-texto-primario">
            {grupo.folioOrden}
            {grupo.folioSii && grupo.folioSii !== grupo.folioOrden ? (
              <span className="ml-1 font-sans text-xs font-normal text-texto-tenue">
                · {grupo.folioSii}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-texto-secundario">{grupo.clienteNombre}</p>
          <p className="text-[11px] text-texto-tenue">
            {procesos.length} proceso{procesos.length === 1 ? '' : 's'} ·{' '}
            {textoCompromiso(grupo.fechaCompromiso, hoy)}
          </p>
        </div>
        <Badge variante={VARIANTE_URGENCIA[grupo.urgencia]}>
          {grupo.urgencia === 'normal' ? 'En tiempo' : grupo.urgencia === 'proxima' ? 'Próxima' : 'Urgente'}
        </Badge>
      </header>

      <ul className="divide-y divide-borde">
        {procesos.map(({ proceso, estado, horasTrabajadas }) => {
          const puedeReclamar =
            proceso.reclamo === null
            && proceso.columna !== 'lista'
            && (proceso.piezasDisponibles === null || proceso.piezasDisponibles > 0);
          const completado = estado === 'terminado'
            || proceso.columna === 'lista'
            || (proceso.metaPiezas > 0 && proceso.hechoPiezas >= proceso.metaPiezas);
          const pendienteAvance = proceso.pendienteActualizacionAvance;
          const puedeGestionar = completado
            ? pendienteAvance
            : (proceso.reclamadoPorMi || puedeReclamar);
          const puedeIniciar = puedeGestionar && proceso.puedeIniciar;
          const puedeReanudar = puedeGestionar && proceso.puedeReanudar;
          const etiquetaGestion = completado
            ? (pendienteAvance ? 'Revisar avance pendiente' : 'Proceso completado')
            : puedeGestionar
              ? 'Gestionar proceso'
              : proceso.piezasDisponibles === 0
                ? `No hay piezas disponibles para ${verboProceso(proceso.procesoNombre, proceso.areaMacro)}`
                : proceso.motivoNoInicia ?? 'Proceso no disponible';
          const puedeLiberar =
            puedeGestionar
            && proceso.reclamo !== null
            && proceso.sesionActiva === null
            && proceso.programacion?.estadoPlaneacion !== 'en_proceso'
            && proceso.programacion?.estadoPlaneacion !== 'bloqueada';
          const porcentaje = Math.min(100, Math.max(0, proceso.porcentaje));

          return (
            <li
              key={proceso.id}
              className="flex min-w-0 flex-col gap-1.5 px-3 py-2"
              data-testid={`mi-proceso-${proceso.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <h4 className="text-sm font-semibold text-texto-primario">
                    {proceso.procesoNombre}
                  </h4>
                  <p className="truncate text-[11px] text-texto-secundario">
                    {proceso.codigoPieza}
                    {proceso.descripcion ? ` · ${proceso.descripcion}` : ''}
                  </p>
                </div>
                <BadgeEstado
                  estado={estado}
                  etiqueta={PRESENTACION_ESTADO[estado].etiqueta}
                  tono={PRESENTACION_ESTADO[estado].tono}
                  className="shrink-0 text-[11px]"
                />              </div>

              {proceso.piezasDisponibles !== null && proceso.piezasDisponibles > 0 ? (
                <p
                  className="rounded bg-acento-suave px-2 py-1 text-[11px] text-acento-texto"
                  data-testid={`disponibles-${proceso.id}`}
                >
                  <strong className="tabular-nums">{Math.round(proceso.piezasDisponibles)}</strong>
                  {' disponibles para '}{verboProceso(proceso.procesoNombre, proceso.areaMacro)}
                  {proceso.procesoPrevioNombre ? `, listas desde ${proceso.procesoPrevioNombre}` : ''}.
                </p>
              ) : null}

              <dl className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] leading-tight">
                <div className="flex min-w-0 items-baseline gap-1">
                  <dt className="text-texto-tenue">Área</dt>
                  <dd className="truncate font-medium text-texto-primario">{proceso.areaNombre}</dd>
                </div>
                <div className="flex items-baseline gap-1">
                  <dt className="text-texto-tenue">Tiempo trabajado</dt>
                  <dd className="font-semibold tabular-nums text-texto-primario">
                    {horasLegibles(horasTrabajadas)}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1">
                  <dt className="text-texto-tenue">Producidas</dt>
                  <dd className="font-semibold tabular-nums text-texto-primario">
                    {Math.round(proceso.hechoPiezas)} / {Math.round(proceso.metaPiezas)}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1">
                  <dt className="text-texto-tenue">Pendientes</dt>
                  <dd className="font-semibold tabular-nums text-texto-primario">
                    {Math.round(proceso.pendientePiezas)}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[11px] text-texto-secundario">
                  Avance del proceso
                </span>
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-2"
                  role="progressbar"
                  aria-label={`Avance de ${proceso.procesoNombre}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={porcentaje}
                >
                  <div
                    className="h-full rounded-full bg-acento"
                    style={{ width: `${porcentaje}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-texto-secundario">
                  {Math.round(proceso.porcentaje)}%
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {puedeIniciar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onIniciar(proceso)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-acento px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Iniciar proceso
                  </button>
                ) : null}

                {puedeReanudar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onReanudar(proceso)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-acento px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Continuar sesión
                  </button>
                ) : null}

                {puedeLiberar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onLiberar(proceso)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-borde px-3 py-1.5 text-xs font-medium text-texto-primario hover:bg-superficie-2 disabled:opacity-50"
                  >
                    Liberar reserva
                  </button>
                ) : null}

                <button
                  type="button"
                  data-testid={`gestionar-proceso-${proceso.id}`}
                  disabled={!puedeGestionar || procesando !== null}
                  onClick={() => onGestionar(proceso)}
                  className={
                    puedeGestionar
                      ? 'inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-acento px-3 py-1.5 text-xs font-semibold text-acento-texto transition-colors hover:bg-acento-suave disabled:opacity-50'
                      : 'inline-flex min-h-11 flex-1 cursor-not-allowed items-center justify-center rounded-md bg-superficie-2 px-3 py-1.5 text-xs text-texto-secundario'
                  }
                >
                  {etiquetaGestion}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
