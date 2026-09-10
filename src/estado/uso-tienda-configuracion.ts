import { create } from 'zustand';
import type {
  AreaTrabajoConfig,
  ConfiguracionSistema,
  CuentaBancaria,
} from '@/modulos/configuracion/tipos/indice';

interface DatosInicialesConfiguracion {
  configuracion: ConfiguracionSistema;
  cuentasBancarias: readonly CuentaBancaria[];
  areasTrabajo: readonly AreaTrabajoConfig[];
}

interface TiendaConfiguracion {
  /** Snapshot visual de la última lectura autorizada; no es fuente contable. */
  configuracion: ConfiguracionSistema | null;
  cuentasBancarias: readonly CuentaBancaria[];
  areasTrabajo: readonly AreaTrabajoConfig[];
  cargando: boolean;
  error: string | null;
  revisionConfiguracion: number;
  establecerDatos: (datos: DatosInicialesConfiguracion) => void;
  establecerConfiguracion: (configuracion: ConfiguracionSistema) => void;
  establecerCuentasBancarias: (cuentas: readonly CuentaBancaria[]) => void;
  establecerAreasTrabajo: (areas: readonly AreaTrabajoConfig[]) => void;
  establecerCargando: (cargando: boolean) => void;
  establecerError: (error: string | null) => void;
  notificarActualizacion: () => void;
  limpiar: () => void;
}

/**
 * Estado efímero de configuración para formularios y consumidores visuales.
 * Las lecturas autorizadas siguen pasando por Server Actions/Realtime; no se
 * persiste en localStorage ni se usa para autorizar operaciones.
 */
export const usarTiendaConfiguracion = create<TiendaConfiguracion>((set) => ({
  configuracion: null,
  cuentasBancarias: [],
  areasTrabajo: [],
  cargando: false,
  error: null,
  revisionConfiguracion: 0,
  establecerDatos: ({ configuracion, cuentasBancarias, areasTrabajo }) => set({
    configuracion,
    cuentasBancarias: [...cuentasBancarias],
    areasTrabajo: [...areasTrabajo],
    error: null,
  }),
  establecerConfiguracion: (configuracion) => set({ configuracion, error: null }),
  establecerCuentasBancarias: (cuentasBancarias) => set({ cuentasBancarias: [...cuentasBancarias] }),
  establecerAreasTrabajo: (areasTrabajo) => set({ areasTrabajo: [...areasTrabajo] }),
  establecerCargando: (cargando) => set({ cargando }),
  establecerError: (error) => set({ error }),
  notificarActualizacion: () => set((estado) => ({ revisionConfiguracion: estado.revisionConfiguracion + 1 })),
  limpiar: () => set({
    configuracion: null,
    cuentasBancarias: [],
    areasTrabajo: [],
    cargando: false,
    error: null,
  }),
}));

export type { DatosInicialesConfiguracion, TiendaConfiguracion };
