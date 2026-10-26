'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, type ChartConfig } from '@/compartido/componentes/ui/chart';
import type { DatoGraficaDashboard } from '@/modulos/dashboard/utilidades/graficas-dashboard';

const CONFIGURACION: ChartConfig = {
  valor: {
    label: 'Valor',
    color: 'var(--info)',
  },
};

type PropsGraficaBarrasDashboard = {
  datos: readonly DatoGraficaDashboard[];
  descripcion: string;
  formatearValor?: (valor: number) => string;
  tono?: 'acento' | 'info' | 'advertencia' | 'peligro';
};

const RELLENO_POR_TONO: Record<NonNullable<PropsGraficaBarrasDashboard['tono']>, string> = {
  acento: 'var(--acento)',
  info: 'var(--info)',
  advertencia: 'var(--advertencia)',
  peligro: 'var(--peligro)',
};

/**
 * Comparación compacta para datos categóricos ya autorizados por el Dashboard.
 * El resumen de texto evita que el dato dependa de hover o de una leyenda visual.
 */
export function GraficaBarrasDashboard({
  datos,
  descripcion,
  formatearValor = (valor) => valor.toLocaleString('es-MX'),
  tono = 'info',
}: PropsGraficaBarrasDashboard) {
  if (datos.length === 0) return null;

  return (
    <div className="grid gap-2">
      <ChartContainer
        config={CONFIGURACION}
        className="h-44 w-full aspect-auto sm:h-48"
        role="img"
        aria-label={descripcion}
      >
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 10, bottom: 4, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--borde)" />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="etiqueta"
            width={116}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--texto-secundario)', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--superficie-2)' }}
            content={({ active, payload }) => {
              const fila = payload?.[0]?.payload as DatoGraficaDashboard | undefined;
              if (!active || !fila) return null;
              return (
                <div className="grid min-w-32 gap-1 rounded-lg border border-borde bg-superficie px-3 py-2 text-xs shadow-elevada">
                  <span className="text-texto-secundario">{fila.etiqueta}</span>
                  <strong className="tabular-nums text-texto-primario">{formatearValor(fila.valor)}</strong>
                </div>
              );
            }}
          />
          <Bar dataKey="valor" fill={RELLENO_POR_TONO[tono]} radius={[0, 5, 5, 0]} maxBarSize={22} />
        </BarChart>
      </ChartContainer>
      <ul className="sr-only" aria-label={`${descripcion}. Desglose textual`}>
        {datos.map((dato) => <li key={dato.id}>{dato.etiqueta}: {formatearValor(dato.valor)}</li>)}
      </ul>
    </div>
  );
}
