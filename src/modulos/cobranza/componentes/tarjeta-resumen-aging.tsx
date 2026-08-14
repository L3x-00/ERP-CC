import type { ResumenAgingCliente } from '@/modulos/cobranza/servicios/aging-servicio';

function formatoMxn(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor);
}

export function TarjetaResumenAging({ resumenes }: { resumenes: readonly ResumenAgingCliente[] }) {
  const total = resumenes.reduce((acumulado, resumen) => acumulado + resumen.totalPendiente, 0);
  const buckets = [
    ['Al corriente', resumenes.reduce((suma, resumen) => suma + resumen.alCorriente, 0)],
    ['1–30 días', resumenes.reduce((suma, resumen) => suma + resumen.de1A30Dias, 0)],
    ['31–60 días', resumenes.reduce((suma, resumen) => suma + resumen.de31A60Dias, 0)],
    ['61–90 días', resumenes.reduce((suma, resumen) => suma + resumen.de61A90Dias, 0)],
    ['+90 días', resumenes.reduce((suma, resumen) => suma + resumen.masDe90Dias, 0)],
  ] as const;

  return (
    <section aria-label="Resumen de antigüedad de cartera" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {buckets.map(([etiqueta, monto]) => (
        <article key={etiqueta} className="rounded-base border border-foreground/15 bg-background p-4 shadow-sm">
          <p className="text-xs font-medium text-foreground/65">{etiqueta}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatoMxn(monto)}</p>
        </article>
      ))}
      <p className="sr-only">Total pendiente en cartera: {formatoMxn(total)}</p>
    </section>
  );
}
