import type { z } from 'zod';
import type { esquemaCotizacionTecnica } from '../validaciones/indice';

export type { CatalogoTarifasCotizador, MaterialCotizador } from '../validaciones/tarifas';
export { MATERIALES_COTIZADOR } from '../validaciones/tarifas';

export type EntradaCotizacionTecnica = z.infer<typeof esquemaCotizacionTecnica>;
export type ProcesoCotizacion = 'laser' | 'router' | 'doblado' | 'fabricacion' | 'otros';
export interface CostoProceso {
  proceso: ProcesoCotizacion;
  material: number;
  servicios: number;
  otros: number;
  total: number;
}
export interface CotizacionTecnicaCalculada {
  version: 1;
  entrada: EntradaCotizacionTecnica;
  procesos: CostoProceso[];
  costoMaterial: number;
  costoServicios: number;
  costoOtros: number;
  costoTotal: number;
  precioUnitario: number;
  precioTotal: number;
  advertencias: string[];
}
