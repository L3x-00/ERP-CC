'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/compartido/utilidades/cn';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import {
  estadoContadorSesion,
  formatearTiempoTranscurrido,
} from '@/modulos/produccion/utilidades/contador-sesion';

export interface PropsContadorSesionVivo {
  /** Marca ISO en la que PostgreSQL abrió la sesión activa. */
  fechaInicio: string;
  /** Tiempo estimado por la orden para este proceso. */
  limiteHoras: number | null;
  testId?: string;
  className?: string;
  /** Oculta el «/ 3 h» cuando el contenedor ya muestra el estimado. */
  mostrarLimite?: boolean;
}

const SEGUNDO_MS = 1_000;

/**
 * Cronómetro de la sesión en marcha.
 *
 * Arranca en `--:--:--` para que el HTML del servidor y el primer render del
 * cliente coincidan (sin errores de hidratación) y, ya montado, avanza cada
 * segundo. El color comunica el único estado que importa en piso: verde dentro
 * del estimado de la orden, rojo cuando se superó.
 */
export function ContadorSesionVivo({
  fechaInicio,
  limiteHoras,
  testId,
  className,
  mostrarLimite = true,
}: PropsContadorSesionVivo) {
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    const marcar = () => setAhora(Date.now());
    // El primer tick va en un temporizador, no en el cuerpo del efecto: así el
    // primer render del cliente coincide con el del servidor y no hay aviso de
    // setState sincrónico en efecto.
    const inicial = window.setTimeout(marcar, 0);
    const temporizador = window.setInterval(marcar, SEGUNDO_MS);
    return () => {
      window.clearTimeout(inicial);
      window.clearInterval(temporizador);
    };
  }, [fechaInicio]);

  const inicio = new Date(fechaInicio).getTime();
  const transcurridas = ahora === null || !Number.isFinite(inicio)
    ? 0
    : Math.max(0, (ahora - inicio) / 3_600_000);
  const estado = ahora === null ? 'sin_limite' : estadoContadorSesion(transcurridas, limiteHoras);
  const texto = ahora === null ? '--:--:--' : formatearTiempoTranscurrido(transcurridas);
  const limiteLegible = typeof limiteHoras === 'number' && limiteHoras > 0
    ? horasLegibles(limiteHoras)
    : null;
  const etiqueta = limiteLegible
    ? `Tiempo transcurrido ${texto}; estimado de la orden ${limiteLegible}`
    : `Tiempo transcurrido ${texto}`;

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={etiqueta}
      data-testid={testId}
      data-estado={estado}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        estado === 'excedido'
          ? 'bg-peligro-suave text-peligro-texto'
          : estado === 'dentro'
            ? 'bg-exito-suave text-exito-texto'
            : 'bg-superficie-2 text-texto-secundario',
        className,
      )}
    >
      <span>{texto}</span>
      {mostrarLimite && limiteLegible ? (
        <span className="font-normal opacity-80">/ {limiteLegible}</span>
      ) : null}
    </span>
  );
}
