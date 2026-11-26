'use client';

import { Badge } from '@/compartido/componentes/ui/badge';
import { cn } from '@/compartido/utilidades/cn';
import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import type { EstadoCorrida, LoteTablero } from '@/modulos/produccion/tipos/indice';

export const ETIQUETA_ESTADO_LOTE: Record<EstadoCorrida, string> = {
  PLANIFICADA: 'Planificada',
  EN_PROCESO: 'En proceso',
  PAUSADA: 'Pausada',
  COMPLETADA: 'Terminada',
  CANCELADA: 'Cancelada',
};

const VARIANTE_ESTADO_LOTE = {
  PLANIFICADA: 'info',
  EN_PROCESO: 'proceso',
  PAUSADA: 'alerta',
  COMPLETADA: 'exito',
  CANCELADA: 'neutro',
} as const;

interface PropsTarjetaLote {
  lote: LoteTablero;
  testId?: string;
  onAbrirOrden?: (ordenId: string) => void;
  /** Abre la ficha del lote para operarlo como una sola corrida. */
  onAbrirLote?: (lote: LoteTablero) => void;
  /** Fila dentro del grupo de una orden: misma información, menos altura. */
  compacta?: boolean;
  className?: string;
}

/**
 * Un lote existe antes de abrir la primera sesión. Esta tarjeta lo hace visible
 * en «En proceso» para que el operador sepa que ya lo creó y puede operarlo.
 */
export function TarjetaLote({
  lote,
  testId = `tarjeta-lote-${lote.id}`,
  onAbrirOrden,
  onAbrirLote,
  compacta = false,
  className,
}: PropsTarjetaLote) {
  const abrir = onAbrirLote
    ? () => onAbrirLote(lote)
    : onAbrirOrden
      ? () => onAbrirOrden(lote.ordenId)
      : undefined;
  return (
    <div
      data-testid={testId}
      data-estado-lote={lote.estado}
      role={abrir ? 'button' : undefined}
      tabIndex={abrir ? 0 : undefined}
      aria-label={abrir ? `Abrir lote ${lote.codigo} de ${lote.folioOrden}` : undefined}
      onClick={abrir}
      onKeyDown={abrir ? (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          abrir();
        }
      } : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-acento/40 bg-acento-suave/20 text-left transition-colors',
        compacta ? 'gap-1 p-2' : 'p-3',
        abrir && 'cursor-pointer hover:border-acento focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/50',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {compacta ? null : (
            <p className="text-xs font-semibold uppercase tracking-wide text-acento-texto">
              {lote.estado === 'PLANIFICADA' ? 'Lote nuevo en proceso' : 'Lote en curso'}
            </p>
          )}
          <strong className={cn(
            'font-mono font-semibold text-texto-primario',
            compacta ? 'text-sm' : 'text-base',
          )}>
            {compacta ? `Lote ${lote.codigo}` : lote.codigo}
          </strong>
        </div>
        <Badge variante={VARIANTE_ESTADO_LOTE[lote.estado]}>
          {ETIQUETA_ESTADO_LOTE[lote.estado]}
        </Badge>
      </div>
      <p className="truncate text-xs text-texto-secundario">
        {lote.folioOrden} · {lote.clienteNombre}
      </p>
      <p className="text-sm font-medium text-texto-primario">{lote.procesoNombre}</p>
      <ul className="flex flex-col gap-1" data-testid={`items-${testId}`}>
        {lote.items.map((item) => (
          <li
            key={item.partidaId}
            className="flex items-center justify-between gap-2 text-xs text-texto-secundario"
          >
            <span className="truncate">{item.codigoItem || 'Pieza'}</span>
            <span className="shrink-0 tabular-nums">
              {formatearNumero(item.cantidad, 0)} piezas
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-texto-tenue">
        Total del lote: {formatearNumero(lote.cantidadPlanificada, 0)} piezas · creado{' '}
        {formatearFecha(lote.creadoEn)}
      </p>
    </div>
  );
}
