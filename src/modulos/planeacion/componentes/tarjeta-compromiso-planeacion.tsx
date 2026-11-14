'use client';

import { Button } from '@/compartido/componentes/ui/button';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { CompromisoPlaneacion } from '@/modulos/planeacion/tipos/indice';

/**
 * Propuesta aceptada que todavía no tiene filas de programación. Se muestra en
 * el calendario sobre la fecha prometida con un color de estado propio (no es
 * una reserva de capacidad) y ofrece el flujo directo para programarla.
 */
export function TarjetaCompromisoPlaneacion({
  compromiso,
  compacta = false,
  onProgramar,
}: {
  compromiso: CompromisoPlaneacion;
  compacta?: boolean;
  onProgramar?: (compromiso: CompromisoPlaneacion) => void;
}) {
  const resumenProcesos = compromiso.procesos.length > 0
    ? compromiso.procesos.join(', ')
    : 'procesos por definir';

  return (
    <article
      data-testid={`compromiso-planeacion-${compromiso.partidaId}`}
      data-estado="por-programar"
      aria-label={`Compromiso ${compromiso.folio} ${compromiso.codigoPieza} por programar`}
      className="flex flex-col gap-1 rounded-base border border-acento/40 bg-acento-suave p-2 text-xs text-texto-primario"
    >
      <span className="font-mono text-[11px] font-medium">
        {compromiso.folio} · {compromiso.codigoPieza}
      </span>
      <span className="text-texto-secundario">
        Compromiso: {formatearFechaCalendario(compromiso.fechaCompromiso)} · {compromiso.horas} h
      </span>
      {!compacta ? (
        <span className="text-texto-secundario">
          {compromiso.areaCodigo ?? 'área por definir'} · {resumenProcesos}
        </span>
      ) : null}
      {onProgramar ? (
        <Button
          type="button"
          tamano="sm"
          variante="secundario"
          className="mt-1 self-start"
          onClick={() => onProgramar(compromiso)}
          data-testid={`programar-compromiso-${compromiso.partidaId}`}
        >
          Programar
        </Button>
      ) : null}
    </article>
  );
}
