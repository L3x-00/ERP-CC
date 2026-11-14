'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { horasLegibles, textoCompromiso } from '@/modulos/produccion/utilidades/formato-operador';
import { verboProceso } from '@/modulos/produccion/utilidades/procesos';
import type { MiProceso, EstadoMiProceso } from '@/modulos/produccion/utilidades/mi-panel-operador';
import type { GrupoOrdenEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

const ETIQUETAS_ESTADO: Record<EstadoMiProceso, string> = {
  en_proceso: 'En proceso',
  pausado: 'Pausado',
  pendiente: 'Pendiente',
  terminado: 'Terminado',
};

const ESTILOS_ESTADO: Record<EstadoMiProceso, string> = {
  en_proceso: 'bg-acento-suave text-acento-texto',
  pausado: 'bg-advertencia-suave text-advertencia-texto',
  pendiente: 'bg-superficie-2 text-texto-secundario',
  terminado: 'bg-exito-suave text-exito-texto',
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
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-borde bg-superficie p-4 shadow-sm transition-shadow hover:shadow-md"
      data-testid={`mis-procesos-orden-${grupo.ordenId}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
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
          <p className="mt-0.5 text-[11px] text-texto-tenue">
            {procesos.length} proceso{procesos.length === 1 ? '' : 's'} ·{' '}
            compromiso: {textoCompromiso(grupo.fechaCompromiso, hoy)}
          </p>
        </div>
        <Badge variante={VARIANTE_URGENCIA[grupo.urgencia]}>
          {grupo.urgencia === 'normal' ? 'En tiempo' : grupo.urgencia === 'proxima' ? 'Próxima' : 'Urgente'}
        </Badge>
      </header>

      <ul className="grid gap-3">
        {procesos.map(({ proceso, estado, horasTrabajadas }) => {
          const puedeReclamar =
            proceso.reclamo === null
            && proceso.columna !== 'lista'
            && (proceso.piezasDisponibles === null || proceso.piezasDisponibles > 0);
          const puedeGestionar = proceso.reclamadoPorMi || puedeReclamar;
          const puedeIniciar = puedeGestionar && proceso.puedeIniciar;
          const puedeReanudar = puedeGestionar && proceso.puedeReanudar;
          const etiquetaGestion = puedeGestionar
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

          return (
            <li
              key={proceso.id}
              className="flex min-w-0 flex-col gap-3 rounded-lg border border-borde bg-superficie-2/30 p-3"
              data-testid={`mi-proceso-${proceso.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-texto-primario">
                    {proceso.procesoNombre}
                  </h4>
                  <p className="mt-0.5 truncate text-xs text-texto-secundario">
                    Pieza: {proceso.codigoPieza}
                    {proceso.descripcion ? ` · ${proceso.descripcion}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${ESTILOS_ESTADO[estado]}`}
                >
                  {ETIQUETAS_ESTADO[estado]}
                </span>
              </div>

              {proceso.piezasDisponibles !== null && proceso.piezasDisponibles > 0 ? (
                <p
                  className="rounded-lg bg-acento-suave px-3 py-2 text-xs text-acento-texto"
                  data-testid={`disponibles-${proceso.id}`}
                >
                  <strong className="tabular-nums">{Math.round(proceso.piezasDisponibles)}</strong>
                  {' disponibles para '}{verboProceso(proceso.procesoNombre, proceso.areaMacro)}
                  {proceso.procesoPrevioNombre ? `, listas desde ${proceso.procesoPrevioNombre}` : ''}.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 rounded-lg bg-superficie p-3 text-sm sm:grid-cols-4">
                <div className="min-w-0">
                  <p className="text-xs text-texto-secundario">Área</p>
                  <p className="truncate font-medium text-texto-primario">{proceso.areaNombre}</p>
                </div>
                <div>
                  <p className="text-xs text-texto-secundario">Tiempo trabajado</p>
                  <p className="font-semibold tabular-nums text-texto-primario">
                    {horasLegibles(horasTrabajadas)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-texto-secundario">Producidas</p>
                  <p className="font-semibold tabular-nums text-texto-primario">
                    {Math.round(proceso.hechoPiezas)} / {Math.round(proceso.metaPiezas)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-texto-secundario">Pendientes</p>
                  <p className="font-semibold tabular-nums text-texto-primario">
                    {Math.round(proceso.pendientePiezas)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-texto-secundario">
                  <span>Avance del proceso</span>
                  <span className="font-semibold tabular-nums">{Math.round(proceso.porcentaje)}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-superficie-2"
                  role="progressbar"
                  aria-label={`Avance de ${proceso.procesoNombre}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.max(0, proceso.porcentaje))}
                >
                  <div
                    className="h-full rounded-full bg-acento"
                    style={{ width: `${Math.min(100, Math.max(0, proceso.porcentaje))}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {puedeIniciar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onIniciar(proceso)}
                    className="flex-1 rounded-lg bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Iniciar proceso
                  </button>
                ) : null}

                {puedeReanudar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onReanudar(proceso)}
                    className="flex-1 rounded-lg bg-acento px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Continuar sesión
                  </button>
                ) : null}

                {puedeLiberar ? (
                  <button
                    type="button"
                    disabled={procesando !== null}
                    onClick={() => onLiberar(proceso)}
                    className="flex-1 rounded-lg border border-borde px-3 py-2 text-sm font-medium text-texto-primario hover:bg-superficie-2 disabled:opacity-50"
                  >
                    Liberar reserva
                  </button>
                ) : null}

                <button
                  type="button"
                  disabled={!puedeGestionar || procesando !== null}
                  onClick={() => onGestionar(proceso)}
                  className={
                    puedeGestionar
                      ? 'w-full rounded-lg border border-acento px-3 py-2 text-sm font-semibold text-acento-texto transition-colors hover:bg-acento-suave disabled:opacity-50'
                      : 'w-full cursor-not-allowed rounded-lg bg-superficie-2 px-3 py-2 text-sm text-texto-secundario'
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
