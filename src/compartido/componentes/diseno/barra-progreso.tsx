import { cn } from '@/compartido/utilidades/cn';

type TonoBarra = 'acento' | 'exito' | 'advertencia' | 'peligro' | 'info';

const FONDOS: Record<TonoBarra, string> = {
  acento: 'bg-acento',
  exito: 'bg-exito',
  advertencia: 'bg-advertencia',
  peligro: 'bg-peligro',
  info: 'bg-info',
};

type PropsBarraProgreso = {
  /** Valor 0–100 (se acota). */
  valor: number;
  tono?: TonoBarra;
  etiqueta?: string;
  /** Muestra el porcentaje a la derecha. */
  mostrarPorcentaje?: boolean;
  className?: string;
};

/** Barra de progreso accesible del sistema (avance de OP, uso de crédito, capacidad). */
export function BarraProgreso({
  valor,
  tono = 'acento',
  etiqueta,
  mostrarPorcentaje = false,
  className,
}: PropsBarraProgreso) {
  const acotado = Number.isFinite(valor) ? Math.min(100, Math.max(0, Math.round(valor))) : 0;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={acotado}
        aria-label={etiqueta ?? 'Progreso'}
        className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-superficie-2"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', FONDOS[tono])}
          style={{ width: `${acotado}%` }}
        />
      </div>
      {mostrarPorcentaje ? (
        <span className="shrink-0 text-xs font-medium tabular-nums text-texto-secundario">
          {acotado}%
        </span>
      ) : null}
    </div>
  );
}
