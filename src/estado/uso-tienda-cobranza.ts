import { create } from 'zustand';

export const PERIODOS_COBRANZA = [
  'hoy',
  'esta_semana',
  'semana_pasada',
  'este_mes',
  'mes_pasado',
  'este_anio',
  'personalizado',
] as const;

export type PeriodoCobranza = (typeof PERIODOS_COBRANZA)[number];

interface RangoPersonalizadoCobranza {
  inicio: string;
  fin: string;
}

interface TiendaCobranza {
  cuentaSeleccionadaId: string | null;
  periodo: PeriodoCobranza;
  rangoPersonalizado: RangoPersonalizadoCobranza | null;
  busqueda: string;
  revisionCartera: number;
  seleccionarCuenta: (cuentaId: string | null) => void;
  establecerPeriodo: (periodo: PeriodoCobranza) => void;
  establecerRangoPersonalizado: (rango: RangoPersonalizadoCobranza | null) => void;
  establecerBusqueda: (busqueda: string) => void;
  notificarActualizacion: () => void;
  limpiarFiltros: () => void;
}

/** Estado efímero de interacción. La cartera y los saldos siempre se releen desde el servidor. */
export const usarTiendaCobranza = create<TiendaCobranza>((set) => ({
  cuentaSeleccionadaId: null,
  periodo: 'este_mes',
  rangoPersonalizado: null,
  busqueda: '',
  revisionCartera: 0,
  seleccionarCuenta: (cuentaSeleccionadaId) => set({ cuentaSeleccionadaId }),
  establecerPeriodo: (periodo) => set({ periodo }),
  establecerRangoPersonalizado: (rangoPersonalizado) => set({ rangoPersonalizado }),
  establecerBusqueda: (busqueda) => set({ busqueda }),
  notificarActualizacion: () => set((estado) => ({ revisionCartera: estado.revisionCartera + 1 })),
  limpiarFiltros: () => set({
    cuentaSeleccionadaId: null,
    periodo: 'este_mes',
    rangoPersonalizado: null,
    busqueda: '',
  }),
}));
