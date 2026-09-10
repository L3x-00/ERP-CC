'use client';

import type { TarjetaMetrica } from '@/modulos/dashboard/tipos/indice';

function formatearValor(tarjeta: TarjetaMetrica): string {
  if (typeof tarjeta.valor === 'string') return tarjeta.valor;
  if (tarjeta.unidad === 'moneda') {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(tarjeta.valor);
  }
  if (tarjeta.unidad === 'porcentaje') return `${tarjeta.valor.toFixed(2)}%`;
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(tarjeta.valor);
}

/** Tarjeta KPI accesible; el color nunca es la única señal del sentido. */
export function WidgetMetricaKPI({ tarjeta }: { tarjeta: TarjetaMetrica }) {
  const señal = tarjeta.tendencia === 'subio' ? '↑' : tarjeta.tendencia === 'bajo' ? '↓' : '→';
  const textoTendencia = tarjeta.tendencia === 'subio' ? 'subió' : tarjeta.tendencia === 'bajo' ? 'bajó' : 'sin cambio';
  return (
    <article className="rounded-base border border-foreground/15 bg-background p-4 shadow-sm" aria-label={tarjeta.titulo} data-testid={`kpi-${tarjeta.id}`}>
      <p className="text-xs font-medium text-foreground/65">{tarjeta.titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatearValor(tarjeta)}</p>
      <p className="mt-2 text-xs text-foreground/65" aria-label={`Variación: ${textoTendencia}`}>
        <span aria-hidden="true" className="mr-1">{señal}</span>
        {tarjeta.variacionPorcentaje === null ? 'Sin comparación disponible' : `${Math.abs(tarjeta.variacionPorcentaje).toFixed(2)}% ${textoTendencia}`}
      </p>
      {tarjeta.descripcion ? <p className="mt-1 text-xs text-foreground/50">{tarjeta.descripcion}</p> : null}
    </article>
  );
}
