import type { ResumenContadorPeriodo, ResumenFinanzasDashboard } from '@/modulos/dashboard/tipos/indice';

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(valor);
}

export interface SeccionFinancieraProps {
  finanzas?: ResumenFinanzasDashboard;
  contador?: ResumenContadorPeriodo;
  titulo?: string;
  identificador?: string;
}

/** Bloque financiero: recibe solo el bloque ya autorizado por la Server Action. */
export function SeccionFinanciera({ finanzas, contador, titulo = 'Finanzas', identificador = 'dashboard' }: SeccionFinancieraProps) {
  if (!finanzas && !contador) return null;
  const items = finanzas
    ? [
        ['CxC pendiente', moneda(finanzas.arPendiente), 'dashboard-ar-pendiente'],
        ['CxC vencido', moneda(finanzas.arVencido), 'dashboard-ar-vencido'],
        ['CxP pendiente', moneda(finanzas.cxpPendiente), 'dashboard-cxp-pendiente'],
        ['Utilidad neta', moneda(finanzas.utilidadNetaAcumulada), 'dashboard-utilidad'],
        ['Margen promedio', finanzas.margenPromedioPorcentaje === null ? '—' : `${finanzas.margenPromedioPorcentaje.toFixed(2)}%`, 'dashboard-margen'],
      ] as const
    : [
        ['CxC pendiente', moneda(contador?.cobranza.arPendienteMxn ?? 0), 'dashboard-ar-pendiente'],
        ['CxC vencido', moneda(contador?.cobranza.arVencidoMxn ?? 0), 'dashboard-ar-vencido'],
        ['CxP pendiente', moneda(contador?.cxp.pendienteMxn ?? 0), 'dashboard-cxp-pendiente'],
        ['Flujo neto', moneda(contador?.flujoCaja.netoMxn ?? 0), 'dashboard-flujo-neto'],
        ['CxP por vencer', moneda(contador?.cxp.porVencerMxn ?? 0), 'dashboard-cxp-por-vencer'],
      ] as const;
  return (
    <section aria-labelledby={`titulo-finanzas-${identificador}`} className="grid gap-3">
      <h2 id={`titulo-finanzas-${identificador}`} className="text-xl font-semibold">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(([tituloItem, valor, id]) => <article key={id} id={identificador === 'dashboard' ? id : `${identificador}-${id}`} className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">{tituloItem}</p><p className="mt-1 text-lg font-bold tabular-nums">{valor}</p></article>)}
      </div>
      {contador ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Antigüedad de cuentas por cobrar">
          {([
            ['Corriente', contador.aging.corrienteMxn],
            ['1–30 días', contador.aging.unoTreintaMxn],
            ['31–60 días', contador.aging.treintaSesentaMxn],
            ['61–90 días', contador.aging.sesentaNoventaMxn],
            ['Más de 90 días', contador.aging.mayorNoventaMxn],
          ] as const).map(([etiqueta, valor]) => <article key={etiqueta} className="rounded-base border border-foreground/15 bg-background p-4"><p className="text-xs text-foreground/65">{etiqueta}</p><p className="mt-1 text-lg font-bold tabular-nums">{moneda(valor)}</p></article>)}
        </div>
      ) : null}
    </section>
  );
}
