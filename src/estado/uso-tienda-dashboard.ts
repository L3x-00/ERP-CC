'use client';

import { create } from 'zustand';
import type {
  DashboardConsolidado,
  FiltroPeriodoDashboard,
} from '@/modulos/dashboard/tipos/indice';

function filtroInicial(): FiltroPeriodoDashboard {
  const ahora = new Date();
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const fin = new Date(inicio);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return {
    fechaInicio: inicio.toISOString(),
    fechaFin: fin.toISOString(),
    periodoTipo: 'hoy',
  };
}

export interface TiendaDashboard {
  filtroActivo: FiltroPeriodoDashboard;
  widgetsCargando: Readonly<Record<string, boolean>>;
  datosConsolidados: DashboardConsolidado | null;
  ultimoError: string | null;
  revisionDashboard: number;
  establecerFiltro: (filtro: FiltroPeriodoDashboard) => void;
  establecerCargaWidget: (widget: string, cargando: boolean) => void;
  establecerDatosConsolidados: (datos: DashboardConsolidado | null) => void;
  establecerError: (error: string | null) => void;
  notificarActualizacion: () => void;
  limpiar: () => void;
}

function crearTiendaDashboard(set: (actualizacion: Partial<TiendaDashboard> | ((estado: TiendaDashboard) => Partial<TiendaDashboard>)) => void): TiendaDashboard {
  const inicial = filtroInicial();
  return {
    filtroActivo: inicial,
    widgetsCargando: {},
    datosConsolidados: null,
    ultimoError: null,
    revisionDashboard: 0,
    establecerFiltro: (filtroActivo) => set({ filtroActivo, ultimoError: null }),
    establecerCargaWidget: (widget, cargando) => set((estado) => ({
      widgetsCargando: { ...estado.widgetsCargando, [widget]: cargando },
    })),
    establecerDatosConsolidados: (datosConsolidados) => set({ datosConsolidados, ultimoError: null }),
    establecerError: (ultimoError) => set({ ultimoError }),
    notificarActualizacion: () => set((estado) => ({ revisionDashboard: estado.revisionDashboard + 1 })),
    limpiar: () => set({ filtroActivo: inicial, widgetsCargando: {}, datosConsolidados: null, ultimoError: null }),
  };
}

/**
 * Estado efímero de interacción. `datosConsolidados` es solo un último
 * snapshot para evitar parpadeos; TanStack Query sigue siendo la fuente de
 * verdad y lo reemplaza después de cada invalidación Realtime.
 */
function useDashboardStore(
  set: (actualizacion: Partial<TiendaDashboard> | ((estado: TiendaDashboard) => Partial<TiendaDashboard>)) => void,
): TiendaDashboard {
  return crearTiendaDashboard(set);
}

export const usarTiendaDashboard = create<TiendaDashboard>((set) => useDashboardStore(set));
