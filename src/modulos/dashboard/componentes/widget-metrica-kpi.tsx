'use client';

import type { TarjetaMetrica } from '@/modulos/dashboard/tipos/indice';

/** Color semántico de la tendencia (positiva, negativa o sin cambio). */
const COLORES_TENDENCIA: Record<TarjetaMetrica['tendencia'], string> = {
  subio: 'text-exito-texto',
  bajo: 'text-peligro-texto',
  neutro: 'text-texto-secundario',
};

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
    <article className="rounded-lg border border-borde bg-superficie p-4 shadow-sm" aria-label={tarjeta.titulo} data-testid={`kpi-${tarjeta.id}`}>
      <p className="text-xs font-medium text-texto-secundario">{tarjeta.titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-texto-primario">{formatearValor(tarjeta)}</p>
      <p className={`mt-2 text-xs ${COLORES_TENDENCIA[tarjeta.tendencia]}`} aria-label={`Variación: ${textoTendencia}`}>
        <span aria-hidden="true" className="mr-1">{señal}</span>
        {tarjeta.variacionPorcentaje === null ? 'Sin comparación disponible' : `${Math.abs(tarjeta.variacionPorcentaje).toFixed(2)}% ${textoTendencia}`}
      </p>
      {tarjeta.descripcion ? <p className="mt-1 text-xs text-texto-secundario">{tarjeta.descripcion}</p> : null}
    </article>
  );
}
