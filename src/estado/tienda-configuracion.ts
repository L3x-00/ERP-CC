import { create } from 'zustand';
import { FORMATO_IVA_DEFECTO } from '@/compartido/constantes/indice';

interface ConfiguracionEmpresa {
  nombreEmpresa: string;
  /** Tipo de cambio MXN por USD. */
  tipoCambio: number;
  /** Porcentaje de IVA aplicable (16 nacional, 8 frontera). */
  ivaPorcentaje: number;
}

interface TiendaConfiguracion extends ConfiguracionEmpresa {
  establecerConfiguracion: (configuracion: Partial<ConfiguracionEmpresa>) => void;
}

/** Tienda global: configuración de empresa (T.C., IVA). */
export const usarTiendaConfiguracion = create<TiendaConfiguracion>((set) => ({
  nombreEmpresa: 'CC Manufacturing Group',
  tipoCambio: 17.0,
  ivaPorcentaje: FORMATO_IVA_DEFECTO,
  establecerConfiguracion: (configuracion) => set(configuracion),
}));
