import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { ResumenAgingCliente } from '@/modulos/cobranza/servicios/aging-servicio';

type TonoAging = 'exito' | 'info' | 'advertencia' | 'peligro';

const BUCKETS: readonly {
  etiqueta: string;
  tono: TonoAging;
  obtener: (resumen: ResumenAgingCliente) => number;
}[] = [
  { etiqueta: 'Al corriente', tono: 'exito', obtener: (resumen) => resumen.alCorriente },
  { etiqueta: '1–30 días', tono: 'info', obtener: (resumen) => resumen.de1A30Dias },
  { etiqueta: '31–60 días', tono: 'advertencia', obtener: (resumen) => resumen.de31A60Dias },
  { etiqueta: '61–90 días', tono: 'advertencia', obtener: (resumen) => resumen.de61A90Dias },
  { etiqueta: '+90 días', tono: 'peligro', obtener: (resumen) => resumen.masDe90Dias },
];

export function TarjetaResumenAging({ resumenes }: { resumenes: readonly ResumenAgingCliente[] }) {
  const total = resumenes.reduce((acumulado, resumen) => acumulado + resumen.totalPendiente, 0);

  return (
    <section aria-label="Resumen de antigüedad de cartera" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {BUCKETS.map(({ etiqueta, tono, obtener }) => {
        const monto = resumenes.reduce((suma, resumen) => suma + obtener(resumen), 0);
        const porcentaje = total > 0 ? (monto / total) * 100 : 0;
        return (
          <article
            key={etiqueta}
            className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-4 shadow-sm"
          >
            <p className="text-xs font-medium text-texto-secundario">{etiqueta}</p>
            <p className="text-xl font-semibold tabular-nums">{formatearMoneda(monto)}</p>
            <BarraProgreso
              valor={porcentaje}
              tono={tono}
              etiqueta={`${etiqueta}: ${formatearMoneda(monto)}`}
              className="mt-auto"
            />
          </article>
        );
      })}
      <p className="sr-only">Total pendiente en cartera: {formatearMoneda(total)}</p>
    </section>
  );
}
