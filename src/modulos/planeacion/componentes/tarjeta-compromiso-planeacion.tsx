'use client';

import { useState } from 'react';

import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { cn } from '@/compartido/utilidades/cn';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { CompromisoPlaneacion } from '@/modulos/planeacion/tipos/indice';
import { formatearHoras } from '@/modulos/planeacion/utilidades/carga-semanal';

/**
 * Propuesta aceptada que todavía no tiene filas de programación. Se muestra en
 * el calendario sobre la fecha prometida con un color de estado propio (no es
 * una reserva de capacidad) y ofrece el flujo directo para programarla.
 *
 * Obs. cliente 2026-11-14: cuando una orden tiene muchas partidas sin programar
 * no se pinta una tarjeta por partida. `TarjetaCompromisosOrden` agrupa todas
 * las de la misma orden en una sola tarjeta desplegable y conserva el mismo
 * botón «Programar» por partida.
 */
export function TarjetaCompromisoPlaneacion({
  compromiso,
  compacta = false,
  anidada = false,
  onProgramar,
}: {
  compromiso: CompromisoPlaneacion;
  compacta?: boolean;
  /** Dentro de una tarjeta de orden: sin borde ni fondo propios. */
  anidada?: boolean;
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
      className={cn(
        'flex flex-col gap-1 text-xs text-texto-primario',
        anidada
          ? 'rounded-sm border border-acento/20 bg-superficie px-2 py-1.5'
          : 'rounded-base border border-acento/40 bg-acento-suave p-2',
      )}
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

/** Una sola tarjeta por orden; al desplegarla aparecen sus partidas. */
export function TarjetaCompromisosOrden({
  compromisos,
  compacta = false,
  onProgramar,
}: {
  compromisos: readonly CompromisoPlaneacion[];
  compacta?: boolean;
  onProgramar?: (compromiso: CompromisoPlaneacion) => void;
}) {
  const [abierta, setAbierta] = useState(true);
  const primero = compromisos[0];
  if (!primero) return null;

  const ordenId = primero.ordenId;
  const totalHoras = compromisos.reduce((total, compromiso) => total + compromiso.horas, 0);
  const totalPartidas = compromisos.length;

  return (
    <article
      data-testid={`compromiso-orden-${ordenId}`}
      className="flex flex-col gap-1 rounded-base border border-acento/40 bg-acento-suave p-2 text-xs text-texto-primario"
    >
      <button
        type="button"
        onClick={() => setAbierta((valor) => !valor)}
        aria-expanded={abierta}
        aria-label={`${abierta ? 'Ocultar' : 'Ver'} las ${totalPartidas} partidas por programar de la orden ${primero.folio}`}
        data-testid={`toggle-compromiso-orden-${ordenId}`}
        className="flex min-w-0 items-center justify-between gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-acento/40 focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-[11px] font-semibold">{primero.folio}</span>
          <Badge variante="neutro" className="shrink-0">
            {totalPartidas} {totalPartidas === 1 ? 'partida' : 'partidas'}
          </Badge>
          <span className="shrink-0 text-[10px] text-texto-secundario">
            {formatearHoras(totalHoras)} h
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-texto-secundario">
          {abierta ? '−' : '+'}
        </span>
      </button>

      {abierta ? (
        <div className="flex flex-col gap-1">
          {compromisos.map((compromiso) => (
            <TarjetaCompromisoPlaneacion
              key={compromiso.partidaId}
              compromiso={compromiso}
              compacta={compacta}
              anidada
              onProgramar={onProgramar}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
