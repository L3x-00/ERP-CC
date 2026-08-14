import { create } from 'zustand';
import type { EstadoKanbanProduccion } from '@/modulos/produccion/tipos/indice';

export interface SesionActivaProduccion {
  id: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
}

interface TiendaProduccion {
  sesionActiva: SesionActivaProduccion | null;
  recursoId: string | null;
  estados: EstadoKanbanProduccion[];
  ordenSeleccionadaId: string | null;
  establecerSesionActiva: (sesion: SesionActivaProduccion | null) => void;
  establecerRecurso: (recursoId: string | null) => void;
  alternarEstado: (estado: EstadoKanbanProduccion) => void;
  establecerEstados: (estados: readonly EstadoKanbanProduccion[]) => void;
  seleccionarOrden: (ordenId: string | null) => void;
  limpiarFiltros: () => void;
}

/**
 * Tienda efímera de interacción. Las órdenes, sesiones y entregas nunca se
 * copian aquí: TanStack Query las vuelve a leer del servidor ante Realtime.
 */
export const usarTiendaProduccion = create<TiendaProduccion>((set) => ({
  sesionActiva: null,
  recursoId: null,
  estados: [],
  ordenSeleccionadaId: null,
  establecerSesionActiva: (sesion) => set({ sesionActiva: sesion }),
  establecerRecurso: (recursoId) => set({ recursoId }),
  alternarEstado: (estado) => set((actual) => ({
    estados: actual.estados.includes(estado)
      ? actual.estados.filter((seleccionado) => seleccionado !== estado)
      : [...actual.estados, estado],
  })),
  establecerEstados: (estados) => set({ estados: [...estados] }),
  seleccionarOrden: (ordenId) => set({ ordenSeleccionadaId: ordenId }),
  limpiarFiltros: () => set({ recursoId: null, estados: [] }),
}));
