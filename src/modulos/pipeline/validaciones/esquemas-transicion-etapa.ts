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

/** Esquema para marcar una oportunidad como ganada. */
export const esquemaMarcarGanada = z.object({ id: z.uuid() });

/** Datos validados para una transición de etapa. */
export type TransicionEtapaInput = z.infer<typeof esquemaTransicionEtapa>;

/** Datos validados para marcar una oportunidad como perdida. */
export type MarcarPerdidaInput = z.infer<typeof esquemaMarcarPerdida>;
