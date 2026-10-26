'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MarcadorCargaGrafica } from '@/modulos/dashboard/componentes/marcador-carga-grafica';
import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { slugDeBucketAging, type BucketAging } from '@/modulos/cobranza/servicios/aging-servicio';
import type { ResumenContadorPeriodo, ResumenFinanzasDashboard } from '@/modulos/dashboard/tipos/indice';
import {
  crearSerieAgingDashboard,
  type DatoGraficaDashboard,
} from '@/modulos/dashboard/utilidades/graficas-dashboard';

const GraficaBarrasDashboard = dynamic(
  () => import('@/modulos/dashboard/componentes/grafica-barras-dashboard').then((modulo) => modulo.GraficaBarrasDashboard),
  { ssr: false, loading: MarcadorCargaGrafica },
);

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(valor);
}

type ItemFinanciero = {
  titulo: string;
  valor: string;
  numero: number | null;
  id: string;
};

export interface SeccionFinancieraProps {
  finanzas?: ResumenFinanzasDashboard;
  contador?: ResumenContadorPeriodo;
  titulo?: string;
  identificador?: string;
  /** Con administrador ya hay bloque ejecutivo: aquí solo se muestra la antigüedad. */
  soloAging?: boolean;
  /** Con contador sin bloque ejecutivo: los importes van en su propia celda. */
  soloItems?: boolean;
}

/** Bloque financiero: recibe solo el bloque ya autorizado por la Server Action. */
export function SeccionFinanciera({
  finanzas,
  contador,
  titulo = 'Finanzas',
  identificador = 'dashboard',
  soloAging = false,
  soloItems = false,
}: SeccionFinancieraProps) {
  if (!finanzas && !contador) return null;

  const items: readonly ItemFinanciero[] = finanzas
    ? [
        { titulo: 'CxC pendiente', valor: moneda(finanzas.arPendiente), numero: finanzas.arPendiente, id: 'dashboard-ar-pendiente' },
        { titulo: 'CxC vencido', valor: moneda(finanzas.arVencido), numero: finanzas.arVencido, id: 'dashboard-ar-vencido' },
        { titulo: 'CxP pendiente', valor: moneda(finanzas.cxpPendiente), numero: finanzas.cxpPendiente, id: 'dashboard-cxp-pendiente' },
        { titulo: 'Utilidad neta', valor: finanzas.utilidadNetaAcumulada === null ? 'No calculable' : moneda(finanzas.utilidadNetaAcumulada), numero: finanzas.utilidadNetaAcumulada, id: 'dashboard-utilidad' },
        { titulo: 'Margen promedio', valor: finanzas.margenPromedioPorcentaje === null ? '—' : `${finanzas.margenPromedioPorcentaje.toFixed(2)}%`, numero: null, id: 'dashboard-margen' },
      ]
    : [
        { titulo: 'CxC pendiente', valor: moneda(contador?.cobranza.arPendienteMxn ?? 0), numero: contador?.cobranza.arPendienteMxn ?? 0, id: 'dashboard-ar-pendiente' },
        { titulo: 'CxC vencido', valor: moneda(contador?.cobranza.arVencidoMxn ?? 0), numero: contador?.cobranza.arVencidoMxn ?? 0, id: 'dashboard-ar-vencido' },
        { titulo: 'CxP pendiente', valor: moneda(contador?.cxp.pendienteMxn ?? 0), numero: contador?.cxp.pendienteMxn ?? 0, id: 'dashboard-cxp-pendiente' },
        { titulo: 'Flujo neto', valor: moneda(contador?.flujoCaja.netoMxn ?? 0), numero: contador?.flujoCaja.netoMxn ?? 0, id: 'dashboard-flujo-neto' },
        { titulo: 'CxP por vencer', valor: moneda(contador?.cxp.porVencerMxn ?? 0), numero: contador?.cxp.porVencerMxn ?? 0, id: 'dashboard-cxp-por-vencer' },
      ];
  const serieFinanciera: DatoGraficaDashboard[] = items
    .filter((item) => item.numero !== null)
    .map((item) => ({ id: item.id, etiqueta: item.titulo, valor: item.numero ?? 0 }));
  const serieAging = contador ? crearSerieAgingDashboard(contador.aging) : [];

  return (
    <section aria-labelledby={`titulo-finanzas-${identificador}`} className="grid gap-3">
      <div>
        <h2 id={`titulo-finanzas-${identificador}`} className="text-xl font-semibold">{titulo}</h2>
        <p className="text-sm text-texto-secundario">Importes reales en MXN para el período seleccionado.</p>
      </div>
      {!soloAging ? (
        <>
          <Tarjeta className="p-3 sm:p-4">
            <GraficaBarrasDashboard
              datos={serieFinanciera}
              tono="acento"
              formatearValor={moneda}
              descripcion={`${titulo}: importes financieros del período seleccionado en MXN.`}
            />
          </Tarjeta>
          <PanelDesplegable
            titulo="Ver desglose financiero"
            descripcion="Los valores no calculables se conservan con su estado original."
            resumen={items[0]?.valor}
            nivelTitulo="h3"
          >
            <ul className="grid gap-1">
              {items.map((item) => (
                <li
                  key={item.id}
                  id={identificador === 'dashboard' ? item.id : `${identificador}-${item.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2"
                >
                  <span className="text-sm text-texto-secundario">{item.titulo}</span>
                  <span className="text-sm font-semibold tabular-nums text-texto-primario">{item.valor}</span>
                </li>
              ))}
            </ul>
          </PanelDesplegable>
        </>
      ) : null}
      {contador && !soloItems ? (
        <>
          <Tarjeta className="p-3 sm:p-4">
            <GraficaBarrasDashboard
              datos={serieAging}
              tono="advertencia"
              formatearValor={moneda}
              descripcion="Antigüedad de cuentas por cobrar del período seleccionado, en MXN."
            />
          </Tarjeta>
          <PanelDesplegable
            titulo="Ver antigüedad de cartera"
            descripcion="Cada rango abre el detalle correspondiente en Cobranza."
            resumen={moneda(serieAging.reduce((total, dato) => total + dato.valor, 0))}
            nivelTitulo="h3"
          >
            <ul className="grid gap-1" aria-label="Antigüedad de cuentas por cobrar">
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-superficie-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
                    aria-label={`Ver en cobranza las cuentas: ${etiqueta}`}
                  >
                    <span className="text-sm text-texto-secundario">{etiqueta}</span>
                    <span className="text-sm font-semibold tabular-nums text-texto-primario">{moneda(valor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </PanelDesplegable>
        </>
      ) : null}
    </section>
  );
}
