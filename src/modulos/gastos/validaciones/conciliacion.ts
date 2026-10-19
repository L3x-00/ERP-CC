import { z } from 'zod';

import type { ConciliacionCostosOrden } from '@/modulos/gastos/tipos/conciliacion';

const concepto = z.enum(['material', 'fabricacion', 'subcontratacion', 'gastos_directos']);
const fuente = z.enum(['compra', 'gasto', 'consumo', 'sesion']);
const monto = z.number().nullable();

const fila = z
  .object({
    concepto,
    estimado: monto,
    comprometido: z.number(),
    real: z.number(),
    variacionAbs: monto,
    variacionPct: monto,
    fuentes: z.array(fuente),
  })
  .strict();

const aviso = z
  .object({
    n: z.number().int().nonnegative(),
    importe: z.number(),
  })
  .strict();

/**
 * Contrato de salida de `obtener_conciliacion_costos_orden`. Se valida en el
 * servidor antes de entregar el payload a la UI: una migración ausente o un
 * cambio de forma no se muestran como ceros silenciosos.
 */
export const esquemaConciliacionCostosOrden: z.ZodType<ConciliacionCostosOrden> = z
  .object({
    ordenId: z.uuid(),
    esInterna: z.boolean(),
    tieneEstimado: z.boolean(),
    moneda: z.string().nullable(),
    tipoCambio: z.number(),
    ventaBaseEstimadoMxn: monto,
    ventaBaseRealMxn: monto,
    conceptos: z.array(fila).length(4),
    totales: z
      .object({
        estimado: monto,
        comprometido: z.number(),
        real: z.number(),
        variacionAbs: monto,
        variacionPct: monto,
      })
      .strict(),
    margenEstimadoPct: monto,
    margenRealPct: monto,
    avisos: z
      .object({
        comprasSinRubro: aviso,
        comprasPagadasSinRecepcion: aviso,
        gastosIncluidosEnRubros: aviso,
      })
      .strict(),
  })
  .strict();
