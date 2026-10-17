'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { formatearHoras } from '@/modulos/planeacion/utilidades/carga-semanal';
import {
  ETIQUETA_SEMAFORO,
  VARIANTE_SEMAFORO,
  type NivelSemaforo,
} from '@/modulos/planeacion/utilidades/etiquetas';

export interface PropsInsigniaSaturacion {
  nivel: NivelSemaforo;
  horasProgramadas?: number | null;
  horasCapacidad?: number | null;
  /**
   * `completa` (tarjeta): icono, texto y horas. `celda` (matriz semanal): icono
   * y horas, con el nivel siempre disponible para lectores de pantalla en
   * `aria-label` y como `title`.
   */
  variante?: 'completa' | 'celda';
  className?: string;
}

function IconoNivel({ nivel }: { nivel: NivelSemaforo }) {
  const comun = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className: 'h-3.5 w-3.5 shrink-0',
  } as const;

  if (nivel === 'disponible') {
    return (
      <svg {...comun}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }

  if (nivel === 'sobrecargado') {
    return (
      <svg {...comun}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    );
  }

  return (
    <svg {...comun}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/**
 * C9.1/P-03: semáforo accesible de 3 niveles (Disponible / Cerca del límite /
 * Sobrecargado). Nunca depende sólo del color: icono, texto y horas.
 */
export function InsigniaSaturacion({
  nivel,
  horasProgramadas,
  horasCapacidad,
  variante = 'completa',
  className,
}: PropsInsigniaSaturacion) {
  const hayHoras = horasProgramadas != null && horasCapacidad != null;
  const horas = hayHoras
    ? `${formatearHoras(horasProgramadas)}/${formatearHoras(horasCapacidad)} h`
    : null;
  const etiqueta = horas ? `${ETIQUETA_SEMAFORO[nivel]}: ${horas}` : ETIQUETA_SEMAFORO[nivel];

  return (
    <Badge
      variante={VARIANTE_SEMAFORO[nivel]}
      className={className}
      aria-label={etiqueta}
      title={variante === 'celda' ? etiqueta : undefined}
      data-testid={`insignia-saturacion-${nivel}`}
    >
      <IconoNivel nivel={nivel} />
      {variante === 'completa' ? <span>{ETIQUETA_SEMAFORO[nivel]}</span> : null}
      {horas ? <span className="font-mono">{horas}</span> : null}
    </Badge>
  );
}
