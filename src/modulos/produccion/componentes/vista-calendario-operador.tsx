'use client';

import { Button } from '@/compartido/componentes/ui/button';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { cn } from '@/compartido/utilidades/cn';
import {
  HORAS_JORNADA_OPERADOR,
  construirDiasCalendario,
  inicioSemana,
  sumarDias,
  type ProcesoEspacioOperador,
  type TipoAccionTarjeta,
} from '@/modulos/produccion/tipos/indice';
import {
  etiquetaDiaCorto,
  etiquetaDiaLargo,
  horasLegibles,
} from '@/modulos/produccion/utilidades/formato-operador';
import { TarjetaProceso } from './tarjeta-proceso';

export interface PropsVistaCalendarioOperador {
  /** Todos los procesos: la carga del día no depende del filtro visible. */
  procesos: ProcesoEspacioOperador[];
  /** Procesos que pasan el filtro de la barra, usados como bolsa por asignar. */
  disponibles: ProcesoEspacioOperador[];
  hoy: string;
  offsetSemana: number;
  soloLectura: boolean;
  procesando: boolean;
  onCambiarSemana: (offset: number) => void;
  onAbrir: (proceso: ProcesoEspacioOperador) => void;
  onAccion: (proceso: ProcesoEspacioOperador, accion: TipoAccionTarjeta) => void;
  /** Reclama o mueve la reserva al día soltado; el servidor revalida capacity. */
  onSoltar: (proceso: ProcesoEspacioOperador, fecha: string) => void;
}

/**
 * C10: calendario semanal de la jornada del operador. Cada día muestra su carga
 * reclamada sobre 8 h; los procesos sin día se arrastran al día libre y las
 * reservas propias se pueden mover entre días.
 */
export function VistaCalendarioOperador({
  procesos,
  disponibles,
  hoy,
  offsetSemana,
  soloLectura,
  procesando,
  onCambiarSemana,
  onAbrir,
  onAccion,
  onSoltar,
}: PropsVistaCalendarioOperador) {
  const fechas = Array.from({ length: 7 }, (_, indice) => (
    sumarDias(inicioSemana(hoy), offsetSemana * 7 + indice)
  ));
  // La jornada de 8 h es personal: solo las reservas propias ocupan el día.
  // En la vista de solo lectura se muestra la carga completa del piso.
  const agenda = soloLectura
    ? procesos
    : procesos.filter((proceso) => proceso.reclamadoPorMi);
  const dias = construirDiasCalendario(fechas, agenda, hoy);
  const porAsignar = disponibles.filter((proceso) => (
    proceso.reclamo === null && proceso.columna !== 'lista'
  ));
  const porId = new Map(procesos.map((proceso) => [proceso.id, proceso]));
  const primerDia = fechas[0];
  const ultimoDia = fechas[fechas.length - 1];

  return (
    <div className="grid gap-4" data-testid="vista-calendario-operador">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-texto-primario">
            {etiquetaDiaLargo(primerDia)} – {etiquetaDiaLargo(ultimoDia)}
          </p>
          <p className="text-xs text-texto-secundario">
            Jornada de {HORAS_JORNADA_OPERADOR} h por día. Arrastra un proceso a un día con horas libres.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variante="contorno" tamano="sm" onClick={() => onCambiarSemana(offsetSemana - 1)}>
            Semana anterior
          </Button>
          <Button variante="contorno" tamano="sm" onClick={() => onCambiarSemana(0)} disabled={offsetSemana === 0}>
            Esta semana
          </Button>
          <Button variante="contorno" tamano="sm" onClick={() => onCambiarSemana(offsetSemana + 1)}>
            Semana siguiente
          </Button>
        </div>
      </div>

      <section aria-label="Procesos por asignar" className="rounded-lg border border-borde bg-superficie p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-texto-primario">
            Por asignar ({porAsignar.length})
          </h3>
          <span className="text-xs text-texto-secundario">
            {horasLegibles(porAsignar.reduce((total, proceso) => total + proceso.horasEstimadas, 0))} pendientes
          </span>
        </div>
        {porAsignar.length === 0 ? (
          <p className="text-sm text-texto-secundario">
            No hay procesos pendientes de agendar. Reclama desde el Kanban o la vista por área.
          </p>
        ) : (
          <ul className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {porAsignar.map((proceso) => (
              <li key={proceso.id} className="min-w-0">
                <TarjetaProceso
                  proceso={proceso}
                  hoy={hoy}
                  compacta
                  arrastrable={!soloLectura}
                  onAbrir={onAbrir}
                  onAccion={onAccion}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {dias.map((dia) => {
          const desbordado = dia.horasReclamadas > HORAS_JORNADA_OPERADOR;
          return (
            <section
              key={dia.fecha}
              className={cn(
                'flex min-h-40 flex-col gap-2 rounded-lg border bg-superficie p-2',
                dia.esHoy ? 'border-acento ring-1 ring-acento/30' : 'border-borde',
                desbordado ? 'border-peligro' : null,
              )}
              data-testid={`dia-${dia.fecha}`}
              aria-label={`${etiquetaDiaLargo(dia.fecha)}: ${horasLegibles(dia.horasReclamadas)} de ${HORAS_JORNADA_OPERADOR} h`}
              onDragOver={(evento) => {
                if (soloLectura) return;
                evento.preventDefault();
                evento.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(evento) => {
                if (soloLectura) return;
                evento.preventDefault();
                const id = evento.dataTransfer.getData('text/plain');
                const proceso = porId.get(id);
                if (proceso) onSoltar(proceso, dia.fecha);
              }}
            >
              <header className="grid gap-1">
                <div className="flex items-baseline justify-between gap-1">
                  <p className={cn('text-xs font-semibold', dia.esHoy ? 'text-acento-texto' : 'text-texto-primario')}>
                    {etiquetaDiaCorto(dia.fecha)}
                  </p>
                  <span className={cn('text-xs tabular-nums', desbordado ? 'font-semibold text-peligro-texto' : 'text-texto-secundario')}>
                    {horasLegibles(dia.horasReclamadas)} / {HORAS_JORNADA_OPERADOR} h
                  </span>
                </div>
                <BarraProgreso
                  valor={(dia.horasReclamadas / HORAS_JORNADA_OPERADOR) * 100}
                  tono={desbordado ? 'peligro' : dia.horasReclamadas >= HORAS_JORNADA_OPERADOR ? 'advertencia' : 'exito'}
                  etiqueta={`Carga de ${etiquetaDiaLargo(dia.fecha)}`}
                />
                <p className="text-[11px] text-texto-tenue">
                  {horasLegibles(dia.horasLibres)} libres
                </p>
              </header>

              {dia.procesos.length === 0 ? (
                <p className="rounded-md border border-dashed border-borde-fuerte/60 p-2 text-center text-xs text-texto-tenue">
                  Día libre
                </p>
              ) : (
                <ul className="grid gap-2">
                  {dia.procesos.map((proceso) => (
                    <li key={proceso.id} className="min-w-0" draggable={!soloLectura && proceso.reclamadoPorMi} onDragStart={(evento) => {
                      if (soloLectura || !proceso.reclamadoPorMi) {
                        evento.preventDefault();
                        return;
                      }
                      evento.dataTransfer.setData('text/plain', proceso.id);
                      evento.dataTransfer.effectAllowed = 'move';
                    }}>
                      <TarjetaProceso
                        proceso={proceso}
                        hoy={hoy}
                        compacta
                        onAbrir={onAbrir}
                        onAccion={onAccion}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {procesando ? (
                <p className="text-[11px] text-texto-tenue" aria-live="polite">Guardando…</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
