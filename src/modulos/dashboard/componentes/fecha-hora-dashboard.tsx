'use client';

import { useEffect, useState } from 'react';
import { ZONA_HORARIA_NEGOCIO } from '@/modulos/configuracion/utilidades/tipo-cambio-diario';

function formatearFechaHoraDashboard(fecha: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ZONA_HORARIA_NEGOCIO,
  }).format(fecha);
}

/** Reloj del taller: se monta en cliente para no desalinear la hidratación. */
export function FechaHoraDashboard() {
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    const actualizar = (): void => setAhora(new Date());
    actualizar();
    const intervalo = window.setInterval(actualizar, 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  return (
    <time
      data-testid="fecha-hora-dashboard"
      dateTime={ahora?.toISOString()}
      aria-label="Fecha y hora actual de Tijuana"
      className="whitespace-nowrap text-sm font-medium text-texto-secundario"
    >
      {ahora ? formatearFechaHoraDashboard(ahora) : 'Fecha y hora local'}
    </time>
  );
}
