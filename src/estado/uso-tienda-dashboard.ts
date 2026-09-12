'use client';

import { create } from 'zustand';
import type { FiltroPeriodoDashboard } from '@/modulos/dashboard/tipos/indice';

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
  ultimoError: string | null;
  revisionDashboard: number;
  establecerFiltro: (filtro: FiltroPeriodoDashboard) => void;
  establecerCargaWidget: (widget: string, cargando: boolean) => void;
  establecerError: (error: string | null) => void;
  notificarActualizacion: () => void;
  limpiar: () => void;
}

function crearTiendaDashboard(set: (actualizacion: Partial<TiendaDashboard> | ((estado: TiendaDashboard) => Partial<TiendaDashboard>)) => void): TiendaDashboard {
  const inicial = filtroInicial();
  return {
    filtroActivo: inicial,
    widgetsCargando: {},
    ultimoError: null,
    revisionDashboard: 0,
    establecerFiltro: (filtroActivo) => set({ filtroActivo, ultimoError: null }),
    establecerCargaWidget: (widget, cargando) => set((estado) => ({
      widgetsCargando: { ...estado.widgetsCargando, [widget]: cargando },
    })),
    establecerError: (ultimoError) => set({ ultimoError }),
    notificarActualizacion: () => set((estado) => ({ revisionDashboard: estado.revisionDashboard + 1 })),
    limpiar: () => set({ filtroActivo: inicial, widgetsCargando: {}, ultimoError: null }),
  };
}

/**
 * Estado efímero de interacción (filtro, carga de widgets y revisión). Los
 * datos consolidados viven únicamente en la caché de TanStack Query; este
 * store no conserva copias de servidor.
 */
function useDashboardStore(
  set: (actualizacion: Partial<TiendaDashboard> | ((estado: TiendaDashboard) => Partial<TiendaDashboard>)) => void,
): TiendaDashboard {
  return crearTiendaDashboard(set);
}

export const usarTiendaDashboard = create<TiendaDashboard>((set) => useDashboardStore(set));
