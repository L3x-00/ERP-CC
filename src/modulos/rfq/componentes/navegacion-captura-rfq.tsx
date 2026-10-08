'use client';

import type { PasoCapturaRfq } from '@/modulos/rfq/utilidades/pasos-captura';

export type { PasoCapturaRfq };

/** Estado visual de un paso respecto del paso actual. */
type EstadoPaso = 'completado' | 'actual' | 'pendiente';

const PASOS: readonly { clave: PasoCapturaRfq; titulo: string }[] = [
  { clave: 'cliente', titulo: 'Cliente' },
  { clave: 'solicitud', titulo: 'Solicitud' },
  { clave: 'items', titulo: 'Ítems' },
  { clave: 'archivos', titulo: 'Archivos' },
  { clave: 'revisar', titulo: 'Revisar' },
];

/** Glifo redundante al color: el estado se entiende en monocromo. */
const GLIFOS: Record<EstadoPaso, string> = {
  completado: '✓',
  actual: '▸',
  pendiente: '○',
};

/** Texto del estado para lectores de pantalla (y para las pruebas). */
const ETIQUETAS_ESTADO: Record<EstadoPaso, string> = {
  completado: 'Completado',
  actual: 'Paso actual',
  pendiente: 'Pendiente',
};

const CLASES_ESTADO: Record<EstadoPaso, string> = {
  completado: 'border-borde-fuerte bg-superficie text-texto-primario',
  actual: 'border-acento bg-acento-suave text-acento',
  pendiente: 'border-dashed border-borde bg-superficie text-texto-secundario',
};

type Props = {
  pasoActual: PasoCapturaRfq;
  /** Pasos que la validación del servidor reporta con datos faltantes. */
  pasosConFaltantes?: readonly PasoCapturaRfq[];
  onSeleccionar: (paso: PasoCapturaRfq) => void;
};

/**
 * Navegación del flujo durable de captura del RFQ (C1.2b): Cliente → Solicitud
 * → Ítems → Archivos → Revisar sobre el MISMO RFQ. Es presentacional: no decide
 * rutas ni pestañas (Cliente y Solicitud pueden apuntar ambas al Resumen), solo
 * informa el paso elegido. El estado se comunica con número, glifo y texto
 * además del color, para que sea legible en monocromo y con lector de pantalla.
 */
export function NavegacionCapturaRfq({
  pasoActual,
  pasosConFaltantes = [],
  onSeleccionar,
}: Props) {
  const indiceActual = PASOS.findIndex((paso) => paso.clave === pasoActual);

  return (
    <nav
      aria-label="Flujo de captura del RFQ"
      data-testid="navegacion-captura-rfq"
      className="rounded-lg border border-borde bg-superficie p-2"
    >
      <ol className="flex flex-wrap items-stretch gap-2">
        {PASOS.map((paso, indice) => {
          const conFaltantes = pasosConFaltantes.includes(paso.clave);
          // Un paso previo con faltantes sigue pendiente: no se muestra como completado.
          let estado: EstadoPaso = 'pendiente';
          if (indice === indiceActual) estado = 'actual';
          else if (indice < indiceActual && !conFaltantes) estado = 'completado';

          return (
            <li key={paso.clave} className="min-w-0 flex-auto">
              <button
                type="button"
                data-paso={paso.clave}
                data-estado={estado}
                data-faltantes={conFaltantes ? 'si' : 'no'}
                aria-current={estado === 'actual' ? 'step' : undefined}
                onClick={() => onSeleccionar(paso.clave)}
                className={[
                  'flex min-h-11 w-full flex-wrap items-center justify-start gap-1.5 rounded-md border px-3 py-2',
                  'text-left text-sm font-semibold transition-colors',
                  'hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-acento/40 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
                  CLASES_ESTADO[estado],
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="font-mono text-xs font-bold tabular-nums"
                >
                  {indice + 1}
                </span>
                <span className="whitespace-normal break-words">{paso.titulo}</span>
                <span aria-hidden="true" className="text-xs">
                  {GLIFOS[estado]}
                </span>
                <span className="sr-only">{ETIQUETAS_ESTADO[estado]}</span>
                {conFaltantes && (
                  <span className="rounded-full border border-peligro/40 bg-peligro-suave px-2 py-0.5 text-xs font-semibold text-peligro-texto">
                    Faltan datos
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
