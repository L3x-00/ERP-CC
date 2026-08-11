import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { CategoriaMaterial, Material } from '@/modulos/inventario/tipos/inventario';

/** Modo de presentación de la lista de materiales. */
export type VistaInventario = 'tabla' | 'tarjetas';

/** Criterio de ordenamiento de la lista. */
export type OrdenInventario = 'nombre' | 'codigo' | 'stock';

/** Modal de inventario abierto (o null si ninguno). */
export type ModalInventario =
  | 'crear-material'
  | 'registrar-entrada'
  | 'registrar-salida'
  | null;

interface EstadoInventario {
  // --- Filtros de búsqueda (efímeros) ---
  busqueda: string;
  categoria: CategoriaMaterial | null;
  /** Mostrar solo materiales en alerta de stock mínimo. */
  soloAlerta: boolean;

  // --- Preferencias de vista (persistidas) ---
  vista: VistaInventario;
  orden: OrdenInventario;

  // --- Modales (efímeros) ---
  modalActivo: ModalInventario;
  /** Material sobre el que opera el modal de entrada/salida (o edición). */
  materialSeleccionado: Material | null;

  // --- Acciones de filtros ---
  setBusqueda: (busqueda: string) => void;
  setCategoria: (categoria: CategoriaMaterial | null) => void;
  setSoloAlerta: (soloAlerta: boolean) => void;
  limpiarFiltros: () => void;

  // --- Acciones de vista ---
  setVista: (vista: VistaInventario) => void;
  setOrden: (orden: OrdenInventario) => void;

  // --- Acciones de modales ---
  abrirModal: (modal: Exclude<ModalInventario, null>) => void;
  /** Abre un modal fijando el material sobre el que opera. */
  abrirModalMaterial: (modal: Exclude<ModalInventario, null>, material: Material) => void;
  cerrarModal: () => void;
}

/**
 * Almacenamiento seguro para SSR/entorno Node: si no hay `window`, no-op (evita
 * romper al importar el store en el servidor o en pruebas de Node).
 */
const almacenamientoSeguro: StateStorage = {
  getItem: (nombre) =>
    typeof window !== 'undefined' ? window.localStorage.getItem(nombre) : null,
  setItem: (nombre, valor) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(nombre, valor);
  },
  removeItem: (nombre) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(nombre);
  },
};

/**
 * Tienda de UI del módulo de inventario: filtros, preferencias de vista y estado
 * de modales. Solo las preferencias de vista (`vista`, `orden`) se persisten
 * (middleware `persist` con `partialize`), para no contaminar el estado global
 * ni recordar filtros/modales entre sesiones.
 */
export const usarInventarioTienda = create<EstadoInventario>()(
  persist(
    (set) => ({
      busqueda: '',
      categoria: null,
      soloAlerta: false,
      vista: 'tabla',
      orden: 'nombre',
      modalActivo: null,
      materialSeleccionado: null,

      setBusqueda: (busqueda) => set({ busqueda }),
      setCategoria: (categoria) => set({ categoria }),
      setSoloAlerta: (soloAlerta) => set({ soloAlerta }),
      limpiarFiltros: () => set({ busqueda: '', categoria: null, soloAlerta: false }),

      setVista: (vista) => set({ vista }),
      setOrden: (orden) => set({ orden }),

      abrirModal: (modal) => set({ modalActivo: modal }),
      abrirModalMaterial: (modal, material) =>
        set({ modalActivo: modal, materialSeleccionado: material }),
      cerrarModal: () => set({ modalActivo: null, materialSeleccionado: null }),
    }),
    {
      name: 'inventario-preferencias-vista',
      storage: createJSONStorage(() => almacenamientoSeguro),
      // Solo se persisten las preferencias de vista.
      partialize: (estado) => ({ vista: estado.vista, orden: estado.orden }),
    },
  ),
);
