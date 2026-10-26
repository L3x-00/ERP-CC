'use client';

import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/compartido/componentes/ui/chart';
import type { DatoGraficaDashboard } from '@/modulos/dashboard/utilidades/graficas-dashboard';

const CONFIGURACION: ChartConfig = {
  valor: { label: 'Importe', color: 'var(--acento)' },
};

const COLORES_SERIE = [
  'var(--acento)',
  'var(--info)',
  'var(--exito)',
  'var(--advertencia)',
  'var(--peligro)',
] as const;

type PropsGraficaDonaDashboard = {
  datos: readonly DatoGraficaDashboard[];
  descripcion: string;
  formatearValor: (valor: number) => string;
};

/** Distribución compacta. El desglose textual complementa la consulta táctil y por teclado. */
export function GraficaDonaDashboard({
  datos,
  descripcion,
  formatearValor,
}: PropsGraficaDonaDashboard) {
  if (datos.length === 0) return null;

  return (
    <div className="grid gap-2">
      <ChartContainer
        config={CONFIGURACION}
        className="mx-auto h-52 w-full max-w-sm aspect-auto sm:h-56"
        role="img"
        aria-label={descripcion}
      >
        <PieChart>
          <Tooltip
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
          <Pie
            data={datos}
            dataKey="valor"
            nameKey="etiqueta"
            innerRadius="55%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--superficie)"
            strokeWidth={2}
          >
            {datos.map((dato, indice) => (
              <Cell key={dato.id} fill={COLORES_SERIE[indice % COLORES_SERIE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="sr-only" aria-label={`${descripcion}. Desglose textual`}>
        {datos.map((dato) => <li key={dato.id}>{dato.etiqueta}: {formatearValor(dato.valor)}</li>)}
      </ul>
    </div>
  );
}
