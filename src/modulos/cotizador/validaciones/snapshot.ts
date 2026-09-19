import { z } from 'zod';
import { esquemaCotizacionTecnica } from './indice';
import { calcularCotizacionTecnica } from '../servicios/calcular-cotizacion-tecnica';

/** Versión1 conserva las entradas y tarifas; el servidor recalcula los importes.
 * Los resultados enviados por el navegador nunca se toman como autoridad.
 */
export const esquemaSnapshotTecnico = z.object({ version: z.literal(1), entrada: esquemaCotizacionTecnica })
  .refine(valor => new TextEncoder().encode(JSON.stringify(valor)).byteLength <= 16_384, 'El cálculo técnico excede el tamaño permitido')
  .transform((valor, contexto) => {
    try { return calcularCotizacionTecnica(valor.entrada); }
    catch { contexto.addIssue({ code: 'custom', message: 'No se puede recuperar el cálculo técnico' }); return z.NEVER; }
  });
