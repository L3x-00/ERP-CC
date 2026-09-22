import Link from 'next/link';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { slugDeBucketAging, type BucketAging } from '@/modulos/cobranza/servicios/aging-servicio';
import type { ResumenContadorPeriodo, ResumenFinanzasDashboard } from '@/modulos/dashboard/tipos/indice';

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(valor);
}

export interface SeccionFinancieraProps {
  finanzas?: ResumenFinanzasDashboard;
  contador?: ResumenContadorPeriodo;
  titulo?: string;
  identificador?: string;
  /** Con administrador ya hay bloque ejecutivo: aquí solo se muestra la antigüedad. */
  soloAging?: boolean;
}

/** Bloque financiero: recibe solo el bloque ya autorizado por la Server Action. */
export function SeccionFinanciera({
  finanzas,
  contador,
  titulo = 'Finanzas',
  identificador = 'dashboard',
  soloAging = false,
}: SeccionFinancieraProps) {
  if (!finanzas && !contador) return null;
  const items = finanzas
    ? [
        ['CxC pendiente', moneda(finanzas.arPendiente), 'dashboard-ar-pendiente'],
        ['CxC vencido', moneda(finanzas.arVencido), 'dashboard-ar-vencido'],
        ['CxP pendiente', moneda(finanzas.cxpPendiente), 'dashboard-cxp-pendiente'],
        ['Utilidad neta', finanzas.utilidadNetaAcumulada === null ? 'No calculable' : moneda(finanzas.utilidadNetaAcumulada), 'dashboard-utilidad'],
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
      {!soloAging ? (
        <Tarjeta>
          <ul className="divide-y divide-borde">
            {items.map(([tituloItem, valor, id]) => (
              <li
                key={id}
                id={identificador === 'dashboard' ? id : `${identificador}-${id}`}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-3"
              >
                <span className="text-sm text-texto-secundario">{tituloItem}</span>
                <span className="text-sm font-semibold tabular-nums text-texto-primario">{valor}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
      {contador ? (
        <Tarjeta>
          <ul className="divide-y divide-borde" aria-label="Antigüedad de cuentas por cobrar">
            {([
              ['Corriente', contador.aging.corrienteMxn, 'alCorriente'],
              ['1–30 días', contador.aging.unoTreintaMxn, 'de1A30Dias'],
              ['31–60 días', contador.aging.treintaSesentaMxn, 'de31A60Dias'],
              ['61–90 días', contador.aging.sesentaNoventaMxn, 'de61A90Dias'],
              ['Más de 90 días', contador.aging.mayorNoventaMxn, 'masDe90Dias'],
            ] as const satisfies readonly (readonly [string, number, BucketAging])[]).map(([etiqueta, valor, bucket]) => (
              <li key={etiqueta}>
                <Link
                  href={`/cobranza?aging=${slugDeBucketAging(bucket)}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 transition-colors hover:bg-superficie-2"
                  aria-label={`Ver en cobranza las cuentas: ${etiqueta}`}
                >
                  <span className="text-sm text-texto-secundario">{etiqueta}</span>
                  <span className="text-sm font-semibold tabular-nums text-texto-primario">{moneda(valor)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null}
    </section>
  );
}
