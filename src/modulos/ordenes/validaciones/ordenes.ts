import { z } from 'zod';
import {
  ACCIONES_TIEMPO_OPERADOR,
  ESTADOS_ORDEN_PRODUCCION,
  PRIORIDADES_ORDEN_PRODUCCION,
} from '@/modulos/ordenes/tipos/ordenes';

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
  prioridad: z.enum(PRIORIDADES_ORDEN_PRODUCCION).default('normal'),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
  partidas: z
    .array(esquemaPartidaOrden)
    .min(1, 'La orden requiere al menos una partida'),
});

/** Una orden manual no puede apropiarse de una cotización de Pipeline. */
export const esquemaCrearOrdenManual = esquemaCrearOrden.omit({ cotizacionId: true }).strict();

export const esquemaCambiarEstadoOrden = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    estadoActual: z.enum(ESTADOS_ORDEN_PRODUCCION),
    estado: z.enum(ESTADOS_ORDEN_PRODUCCION),
    motivoCancelacion: z.string().trim().optional(),
  })
  .superRefine((valor, ctx) => {
    if (valor.estado !== 'cancelada') {
      return;
    }

    const motivo = valor.motivoCancelacion?.trim() ?? '';

    if (motivo.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['motivoCancelacion'],
        message: 'El motivo de cancelación es requerido y debe tener al menos 3 caracteres',
      });
    }
  });

export const esquemaRegistrarTiempoOperador = z.object({
  partidaId: z.uuid('ID de partida inválido'),
  operadorId: z.uuid('ID de operador inválido'),
  accion: z.enum(ACCIONES_TIEMPO_OPERADOR),
  fechaRegistro: z.iso.datetime({ message: 'Fecha de registro inválida' }).optional(),
  notas: z.string().trim().optional(),
});

/** Consumo en unidad de control; usado y scrap salen juntos del inventario. */
export const esquemaRegistrarConsumoMaterial = z
  .object({
    partidaId: z.uuid('ID de partida inválido'),
    materialId: z.uuid('ID de material inválido'),
    cantidadUsada: z.number().min(0, 'La cantidad usada no puede ser negativa'),
    cantidadScrap: z.number().min(0, 'La cantidad de scrap no puede ser negativa'),
  })
  .refine((valor) => valor.cantidadUsada + valor.cantidadScrap > 0, {
    message: 'Debe registrar una cantidad usada o scrap mayor a 0',
    path: ['cantidadUsada'],
  });

export type PartidaOrdenInput = z.infer<typeof esquemaPartidaOrden>;
export type CrearOrdenInput = z.infer<typeof esquemaCrearOrden>;
export type CrearOrdenManualInput = z.infer<typeof esquemaCrearOrdenManual>;
export type CambiarEstadoOrdenInput = z.infer<typeof esquemaCambiarEstadoOrden>;
export type RegistrarTiempoOperadorInput = z.infer<typeof esquemaRegistrarTiempoOperador>;
export type RegistrarConsumoMaterialInput = z.infer<typeof esquemaRegistrarConsumoMaterial>;
