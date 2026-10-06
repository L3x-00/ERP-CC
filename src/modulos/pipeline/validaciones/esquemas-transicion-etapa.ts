import { z } from 'zod';

/**
 * Esquemas de las acciones legacy que se conservan hasta B4/B5 (ganar/perder).
 * Las transiciones de etapa fueron retiradas: el estado del RFQ se valida con
 * `esquemaCambiarEstadoRfq` de `@/modulos/rfq/validaciones/esquemas-rfq`.
 */

/** Esquema para marcar una oportunidad como perdida (motivo obligatorio). */
export const esquemaMarcarPerdida = z.object({
  id: z.uuid(),
  motivoPerdida: z.string().min(3, 'El motivo es obligatorio'),
  notasPerdida: z.string().optional(),
});

/**
 * Esquema para aprobar una oportunidad. La fecha de compromiso es parte de la
 * orden resultante y evita crear OPs sin una promesa de entrega trazable.
 * `autorizarSobregiro` es el consentimiento explícito del administrador cuando
 * el cliente ya alcanzó su límite de crédito (RFQ-16).
 */
export const esquemaMarcarGanada = z.object({
  id: z.uuid(),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
  autorizarSobregiro: z.boolean().default(false),
});

/** Datos validados para marcar una oportunidad como perdida. */
export type MarcarPerdidaInput = z.infer<typeof esquemaMarcarPerdida>;

/** Datos validados para aprobar oportunidad y crear la orden de producción. */
export type MarcarGanadaInput = z.infer<typeof esquemaMarcarGanada>;
