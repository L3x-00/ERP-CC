import { z } from 'zod';

export const esquemaPartidaOrden = z.object({
  codigoPieza: z.string().trim().min(1, 'El código de pieza es requerido'),
  descripcion: z.string().trim().optional(),
  cantidadSolicitada: z.number().positive('La cantidad debe ser mayor a 0'),
  unidadMedida: z.string().trim().min(1, 'La unidad de medida es requerida'),
  materialId: z.uuid('ID de material inválido').optional(),
  tiempoEstimadoMinutos: z.number().min(0, 'El tiempo no puede ser negativo').default(0),
  maquinaAsignada: z.string().trim().optional(),
});

export const esquemaCrearOrden = z.object({
  clienteId: z.uuid('ID de cliente inválido'),
  cotizacionId: z.uuid('ID de cotización inválido').optional(),
  prioridad: z.enum(['baja', 'normal', 'alta', 'urgente']).default('normal'),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
  partidas: z
    .array(esquemaPartidaOrden)
    .min(1, 'La orden requiere al menos una partida'),
});

export const esquemaCambiarEstadoOrden = z.object({
  ordenId: z.uuid('ID de orden inválido'),
  estado: z.enum(['borrador', 'programada', 'en_proceso', 'pausada', 'completada', 'cancelada']),
});

export const esquemaRegistrarTiempoOperador = z.object({
  partidaId: z.uuid('ID de partida inválido'),
  operadorId: z.uuid('ID de operador inválido'),
  accion: z.enum(['inicio', 'pausa', 'fin']),
  fechaRegistro: z.iso.datetime({ message: 'Fecha de registro inválida' }).optional(),
  notas: z.string().trim().optional(),
});

export type PartidaOrdenInput = z.infer<typeof esquemaPartidaOrden>;
export type CrearOrdenInput = z.infer<typeof esquemaCrearOrden>;
export type CambiarEstadoOrdenInput = z.infer<typeof esquemaCambiarEstadoOrden>;
export type RegistrarTiempoOperadorInput = z.infer<typeof esquemaRegistrarTiempoOperador>;
