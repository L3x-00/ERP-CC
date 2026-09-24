import { create } from 'zustand';
import type { CategoriaGasto, EstadoGasto, TipoGasto } from '@/modulos/gastos/tipos/indice';

export const PERIODOS_GASTOS = [
  'hoy',
  'esta_semana',
  'semana_pasada',
  'este_mes',
  'mes_pasado',
  'este_anio',
  'personalizado',
] as const;

export type PeriodoGastos = (typeof PERIODOS_GASTOS)[number];

type RangoGastos = { inicio: string; fin: string };

interface TiendaGastos {
  gastoSeleccionadoId: string | null;
  periodo: PeriodoGastos;
  rango: RangoGastos | null;
  categorias: readonly CategoriaGasto[];
  estados: readonly EstadoGasto[];
  busqueda: string;
  proveedorId: string;
  filtroIva: 'todos' | 'con' | 'sin';
  filtroTipo: TipoGasto | 'todos';
  ocrEnCurso: boolean;
  revisionGastos: number;
  establecerPeriodo: (periodo: PeriodoGastos) => void;
  seleccionarGasto: (gastoId: string | null) => void;
  establecerRango: (rango: RangoGastos | null) => void;
  establecerCategorias: (categorias: readonly CategoriaGasto[]) => void;
  establecerEstados: (estados: readonly EstadoGasto[]) => void;
  establecerBusqueda: (busqueda: string) => void;
  establecerProveedorId: (proveedorId: string) => void;
  establecerFiltroIva: (filtroIva: 'todos' | 'con' | 'sin') => void;
  establecerFiltroTipo: (filtroTipo: TipoGasto | 'todos') => void;
  establecerOcrEnCurso: (enCurso: boolean) => void;
  notificarActualizacion: () => void;
  limpiarFiltros: () => void;
}

/** Estado efímero de filtros; nunca contiene importes ni filas de servidor. */
export const usarTiendaGastos = create<TiendaGastos>((set) => ({
  gastoSeleccionadoId: null,
  periodo: 'este_mes',
  rango: null,
  categorias: [],
  estados: [],
  busqueda: '',
  proveedorId: '',
  filtroIva: 'todos',
  filtroTipo: 'todos',
  ocrEnCurso: false,
  revisionGastos: 0,
  establecerPeriodo: (periodo) => set({ periodo }),
  seleccionarGasto: (gastoSeleccionadoId) => set({ gastoSeleccionadoId }),
  establecerRango: (rango) => set({ rango }),
  establecerCategorias: (categorias) => set({ categorias: [...categorias] }),
  establecerEstados: (estados) => set({ estados: [...estados] }),
  establecerBusqueda: (busqueda) => set({ busqueda }),
  establecerProveedorId: (proveedorId) => set({ proveedorId }),
  establecerFiltroIva: (filtroIva) => set({ filtroIva }),
  establecerFiltroTipo: (filtroTipo) => set({ filtroTipo }),
  establecerOcrEnCurso: (ocrEnCurso) => set({ ocrEnCurso }),
  notificarActualizacion: () => set((estado) => ({ revisionGastos: estado.revisionGastos + 1 })),
  limpiarFiltros: () => set({
    gastoSeleccionadoId: null,
    periodo: 'este_mes',
    rango: null,
    categorias: [],
    estados: [],
    busqueda: '',
    proveedorId: '',
    filtroIva: 'todos',
    filtroTipo: 'todos',
  }),
}));
