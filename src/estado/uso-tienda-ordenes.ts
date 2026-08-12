import { create } from 'zustand';
import type { EstadoOrden } from '@/modulos/ordenes/tipos/ordenes';

interface TiendaOrdenes {
  /** Orden abierta en el detalle/panel de piso (o null si ninguna). */
  ordenActivaId: string | null;
  /** Máquina por la que se filtra el tablero de piso (o null = todas). */
  filtroMaquina: string | null;
  /** Estados seleccionados; lista vacía = sin filtrar por estado. */
  filtrosEstado: EstadoOrden[];
  /**
   * Contador de invalidación: cada incremento señala a la UI que debe volver a
   * consultar datos de órdenes. Se usa como dependencia de las consultas para
   * no esperar a que el estado remoto se propague.
   */
  versionActualizacion: number;

  seleccionarOrden: (ordenId: string | null) => void;
  establecerFiltroMaquina: (maquina: string | null) => void;
  alternarFiltroEstado: (estado: EstadoOrden) => void;
  establecerFiltrosEstado: (estados: EstadoOrden[]) => void;
  limpiarFiltros: () => void;
  refrescarOrdenes: () => void;
}

/**
 * Tienda de UI de Órdenes de Producción: orden activa, filtros de piso y
 * disparador de refresco. Sin `persist` a propósito — la orden activa y los
 * filtros de piso no deben sobrevivir a la sesión (un turno nuevo arranca
 * limpio, sin heredar el contexto del turno anterior).
 */
export const usarTiendaOrdenes = create<TiendaOrdenes>((set) => ({
  ordenActivaId: null,
  filtroMaquina: null,
  filtrosEstado: [],
  versionActualizacion: 0,

  seleccionarOrden: (ordenId) => set({ ordenActivaId: ordenId }),
  establecerFiltroMaquina: (maquina) => set({ filtroMaquina: maquina }),
  alternarFiltroEstado: (estado) =>
    set((actual) => ({
      filtrosEstado: actual.filtrosEstado.includes(estado)
        ? actual.filtrosEstado.filter((seleccionado) => seleccionado !== estado)
        : [...actual.filtrosEstado, estado],
    })),
  // Copia defensiva: el arreglo recibido puede seguir mutándose fuera de la tienda.
  establecerFiltrosEstado: (estados) => set({ filtrosEstado: [...estados] }),
  limpiarFiltros: () => set({ filtroMaquina: null, filtrosEstado: [] }),
  refrescarOrdenes: () =>
    set((actual) => ({ versionActualizacion: actual.versionActualizacion + 1 })),
}));
