import { z } from 'zod';

/**
 * Esquema para transiciones de etapa no terminales (avances y reversiones).
 * Las etapas terminales "ganada"/"perdida" existen en el enum, pero sus
 * transiciones se manejan por las acciones específicas de ganar/perder.
 */
export const esquemaTransicionEtapa = z.object({
  id: z.uuid(),
  etapaDestino: z.enum([
    'prospecto',
    'contactado',
    'cotizado',
    'negociacion',
    'ganada',
    'perdida',
  ]),
});

/** Esquema para marcar una oportunidad como perdida (motivo obligatorio). */
export const esquemaMarcarPerdida = z.object({
  id: z.uuid(),
  motivoPerdida: z.string().min(3, 'El motivo es obligatorio'),
  notasPerdida: z.string().optional(),
});

/**
 * Esquema para aprobar una oportunidad. La fecha de compromiso es parte de la
 * orden resultante y evita crear OPs sin una promesa de entrega trazable.
 */
export const esquemaMarcarGanada = z.object({
  id: z.uuid(),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
});

/** Datos validados para una transición de etapa. */
export type TransicionEtapaInput = z.infer<typeof esquemaTransicionEtapa>;

/** Datos validados para marcar una oportunidad como perdida. */
export type MarcarPerdidaInput = z.infer<typeof esquemaMarcarPerdida>;

/** Datos validados para aprobar oportunidad y crear la orden de producción. */
export type MarcarGanadaInput = z.infer<typeof esquemaMarcarGanada>;
