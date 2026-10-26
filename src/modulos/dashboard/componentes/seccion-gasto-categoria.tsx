'use client';

import dynamic from 'next/dynamic';
import { MarcadorCargaGrafica } from '@/modulos/dashboard/componentes/marcador-carga-grafica';
import { PanelDesplegable } from '@/compartido/componentes/diseno/panel-desplegable';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import type { GastoPorCategoriaDashboard } from '@/modulos/dashboard/tipos/indice';
import {
  crearSerieGastoDashboard,
  ETIQUETAS_GASTO,
} from '@/modulos/dashboard/utilidades/graficas-dashboard';

const GraficaDonaDashboard = dynamic(
  () => import('@/modulos/dashboard/componentes/grafica-dona-dashboard').then((modulo) => modulo.GraficaDonaDashboard),
  { ssr: false, loading: MarcadorCargaGrafica },
);

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(valor);
}

export interface SeccionGastoCategoriaProps {
  distribucion: readonly GastoPorCategoriaDashboard[];
  titulo?: string;
  identificador?: string;
}

/** DAS-06: distribución del gasto del periodo por categoría, en MXN. */
export function SeccionGastoCategoria({
  distribucion,
  titulo = 'Gasto por categoría',
  identificador = 'dashboard',
}: SeccionGastoCategoriaProps) {
  if (distribucion.length === 0) return null;
  const serie = crearSerieGastoDashboard(distribucion);
  const total = serie.reduce((suma, fila) => suma + fila.valor, 0);

  return (
    <section aria-labelledby={`titulo-gasto-categoria-${identificador}`} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`titulo-gasto-categoria-${identificador}`} className="text-xl font-semibold">{titulo}</h2>
          <p className="text-sm text-texto-secundario">Distribución real de los gastos del período seleccionado.</p>
        </div>
        <span className="rounded-full bg-acento-suave px-3 py-1 text-xs font-semibold text-acento-texto">
          Total: {moneda(total)}
        </span>
      </div>
      <Tarjeta className="p-3 sm:p-4">
        <GraficaDonaDashboard
          datos={serie}
          formatearValor={moneda}
          descripcion="Distribución del gasto por categoría en MXN."
        />
      </Tarjeta>
      <PanelDesplegable
        titulo="Ver desglose de gasto"
        descripcion="Importe y proporción de cada categoría, sin ocultar información del período."
        resumen={`${serie.length} categorías`}
        nivelTitulo="h3"
      >
        <ul className="grid gap-1" aria-label="Distribución de gasto por categoría">
          {distribucion.map((fila) => {
            const porcentaje = total > 0 ? (fila.montoMxn / total) * 100 : 0;
            return (
              <li
                key={fila.categoria}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-superficie-2/60"
              >
                <span className="text-sm text-texto-secundario">
                  {ETIQUETAS_GASTO[fila.categoria] ?? fila.categoria}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs tabular-nums text-texto-secundario">{porcentaje.toFixed(1)}%</span>
                  <span className="text-sm font-semibold tabular-nums text-texto-primario">{moneda(fila.montoMxn)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </PanelDesplegable>
    </section>
  );
}
