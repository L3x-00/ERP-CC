import { create } from 'zustand';

interface TiendaUI {
  modalAbierto: boolean;
  barraLateralContraida: boolean;
  abrirModal: () => void;
  cerrarModal: () => void;
  contraerBarra: () => void;
  expandirBarra: () => void;
}

/** Tienda global: estado de UI (modales, barra lateral). */
export const usarTiendaUI = create<TiendaUI>((set) => ({
  modalAbierto: false,
  barraLateralContraida: false,
  abrirModal: () => set({ modalAbierto: true }),
  cerrarModal: () => set({ modalAbierto: false }),
  contraerBarra: () => set({ barraLateralContraida: true }),
  expandirBarra: () => set({ barraLateralContraida: false }),
}));
