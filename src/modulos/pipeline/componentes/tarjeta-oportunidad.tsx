'use client';

import { SelectorEtapa } from '@/modulos/pipeline/componentes/selector-etapa';
import type { AlertaPipeline } from '@/modulos/pipeline/servicios/calcular-alertas';
import type { Oportunidad, PrioridadPipeline } from '@/modulos/pipeline/tipos/indice';

type PropsTarjetaOportunidad = {
  oportunidad: Oportunidad;
  alertas: AlertaPipeline[];
};

/** Texto legible y clases de color por tipo de alerta (ámbar/rojo). */
const ESTILO_ALERTA: Record<AlertaPipeline, { texto: string; clase: string }> = {
  sin_respuesta: {
    texto: 'Sin respuesta',
    clase: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
  estancada: {
    texto: 'Estancada',
    clase: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  },
  datos_incompletos: {
    texto: 'Datos incompletos',
    clase: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  },
};

/** Texto legible y clases de color por prioridad. */
const ESTILO_PRIORIDAD: Record<PrioridadPipeline, { texto: string; clase: string }> = {
  baja: { texto: 'Baja', clase: 'bg-foreground/10 text-foreground/60' },
  normal: { texto: 'Normal', clase: 'bg-foreground/10 text-foreground/70' },
  alta: {
    texto: 'Alta',
    clase: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  },
  urgente: {
    texto: 'Urgente',
    clase: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300',
  },
};

/**
 * Tarjeta compacta de una oportunidad del pipeline. Muestra el folio (CNC si ya
 * existe, si no el OP), empresa, contacto, prioridad y las alertas visuales
 * calculadas. Incluye el selector de etapa para mover la oportunidad sin salir
 * del tablero.
 */
export function TarjetaOportunidad({ oportunidad, alertas }: PropsTarjetaOportunidad) {
  const folio = oportunidad.folioCnc ?? oportunidad.folioOp;
  const prioridad = ESTILO_PRIORIDAD[oportunidad.prioridad];

  return (
    <article className="flex flex-col gap-2 rounded-base border border-foreground/10 bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-foreground/60">{folio}</span>
        <span className={`rounded-base px-2 py-0.5 text-xs font-medium ${prioridad.clase}`}>
          {prioridad.texto}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-foreground">{oportunidad.empresa}</h3>
        <p className="text-xs text-foreground/70">{oportunidad.nombreContacto}</p>
      </div>

      {alertas.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {alertas.map((alerta) => (
            <li
              key={alerta}
              className={`rounded-base px-2 py-0.5 text-xs font-medium ${ESTILO_ALERTA[alerta].clase}`}
            >
              {ESTILO_ALERTA[alerta].texto}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-foreground/10 pt-2">
        <SelectorEtapa oportunidad={oportunidad} />
      </div>
    </article>
  );
}
