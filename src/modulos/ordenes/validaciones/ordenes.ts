import { z } from 'zod';
import {
  ACCIONES_TIEMPO_OPERADOR,
  CONDICIONES_PAGO_ORDEN,
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
}).strict();

export const esquemaCrearOrden = z.object({
  clienteId: z.uuid('ID de cliente inválido'),
  cotizacionId: z.uuid('ID de cotización inválido').optional(),
  prioridad: z.enum(PRIORIDADES_ORDEN_PRODUCCION).default('normal'),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
  partidas: z
    .array(esquemaPartidaOrden)
    .min(1, 'La orden requiere al menos una partida'),
}).strict();

/** Una orden manual no puede apropiarse de una cotización de Pipeline. */
export const esquemaCrearOrdenManual = esquemaCrearOrden.omit({ cotizacionId: true }).strict();

/** ORD-06: partida heredada con área del catálogo, procesos y proveedor externo. */
export const esquemaPartidaOrdenHistorica = esquemaPartidaOrden
  .extend({
    areaTrabajoCodigo: z.string().trim().max(48, 'Área inválida').optional(),
    procesos: z.array(z.string().trim().min(1).max(60)).max(20, 'Máximo 20 procesos').optional(),
    esExterno: z.boolean().optional(),
    proveedorExterno: z.string().trim().max(120).optional(),
  })
  .strict();

/** ORD-06: alta administrativa del trabajo heredado (excepción D-01/OBS-15). */
export const esquemaCrearOrdenHistorica = z
  .object({
    clienteId: z.uuid('ID de cliente inválido'),
    idHistorico: z.string().trim().min(1, 'Indica el ID previo').max(40, 'Máximo 40 caracteres'),
    fechaTrabajo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha del trabajo inválida'),
    fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
    condicionPago: z.enum(CONDICIONES_PAGO_ORDEN),
    referenciaExterna: z.string().trim().max(120, 'Máximo 120 caracteres').optional(),
    montoSinIva: z.number().min(0, 'El monto no puede ser negativo').max(99999999.9999),
    montoIva: z.number().min(0, 'El IVA no puede ser negativo').max(99999999.9999),
    horasEstimadas: z.number().min(0, 'Las horas no pueden ser negativas').max(999999.99),
    notas: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
    partidas: z
      .array(esquemaPartidaOrdenHistorica)
      .min(1, 'La orden requiere al menos una partida')
      .max(100, 'Máximo 100 partidas'),
  })
  .strict()
  .refine((valor) => valor.montoSinIva + valor.montoIva > 0, {
    message: 'El monto sin IVA más el IVA debe ser mayor a cero',
    path: ['montoSinIva'],
  });

/** CLI-08: repetir un trabajo histórico o completado con una fecha nueva. */
export const esquemaRepetirOrden = z.object({
  ordenOrigenId: z.uuid('ID de orden origen inválido'),
  fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
}).strict();

/** ORD-05: partida existente (con `id`) o nueva (sin `id`) dentro de la edición. */
export const esquemaPartidaOrdenEdicion = esquemaPartidaOrden
  .extend({ id: z.uuid('ID de partida inválido').optional() })
  .strict();

/** ORD-07: ruta ordenada y meta independiente para cada proceso de una parte. */
export const esquemaConfigurarMetasProceso = z.object({
  partidaId: z.uuid('ID de partida inválido'),
  ordenActualizadoEn: z.iso.datetime({ offset: true, message: 'Token de versión inválido' }),
  procesos: z.array(z.object({
    nombre: z.string().trim().min(1, 'Indica el proceso').max(60),
    metaPiezas: z.number().positive('La meta debe ser mayor a cero').max(9999999999.9999),
  }).strict()).min(1, 'Agrega al menos un proceso').max(20, 'Máximo 20 procesos'),
}).strict();

/** ORD-05: edición de cabecera y partidas mientras la OP está en borrador. */
export const esquemaActualizarOrdenBorrador = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    actualizadoEn: z.iso.datetime({ offset: true, message: 'Token de versión inválido' }),
    prioridad: z.enum(PRIORIDADES_ORDEN_PRODUCCION),
    fechaCompromiso: z.iso.datetime({ message: 'Fecha de compromiso inválida' }),
    partidas: z
      .array(esquemaPartidaOrdenEdicion)
      .min(1, 'La orden requiere al menos una partida'),
  })
  .strict();

export const esquemaCambiarEstadoOrden = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    estadoActual: z.enum(ESTADOS_ORDEN_PRODUCCION),
    estado: z.enum(ESTADOS_ORDEN_PRODUCCION),
    motivoCancelacion: z.string().trim().optional(),
  }).strict()
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
  notas: z.string().trim().optional(),
}).strict();

/** Consumo en unidad de control; usado y scrap salen juntos del inventario. */
export const esquemaRegistrarConsumoMaterial = z
  .object({
    partidaId: z.uuid('ID de partida inválido'),
    materialId: z.uuid('ID de material inválido'),
    cantidadUsada: z.number().min(0, 'La cantidad usada no puede ser negativa'),
    cantidadScrap: z.number().min(0, 'La cantidad de scrap no puede ser negativa'),
  }).strict()
  .refine((valor) => valor.cantidadUsada + valor.cantidadScrap > 0, {
    message: 'Debe registrar una cantidad usada o scrap mayor a 0',
    path: ['cantidadUsada'],
  });

/** Avance acumulable de una partida: producción buena y scrap de fabricación. */
export const esquemaRegistrarAvancePartida = z
  .object({
    partidaId: z.uuid('ID de partida inválido'),
    cantidadProducida: z.number().min(0, 'La cantidad producida no puede ser negativa'),
    cantidadScrap: z.number().min(0, 'La cantidad de scrap no puede ser negativa'),
  }).strict()
  .refine((valor) => valor.cantidadProducida + valor.cantidadScrap > 0, {
    message: 'Debe registrar producción o scrap mayor a 0',
    path: ['cantidadProducida'],
  });

/** Asignación explícita que autoriza a un operador a trabajar una partida. */
export const esquemaAsignarOperadorPartida = z.object({
  partidaId: z.uuid('ID de partida inválido'),
  operadorId: z.uuid('ID de operador inválido'),
}).strict();

export type PartidaOrdenInput = z.infer<typeof esquemaPartidaOrden>;
export type CrearOrdenInput = z.infer<typeof esquemaCrearOrden>;
export type CrearOrdenManualInput = z.infer<typeof esquemaCrearOrdenManual>;
export type CrearOrdenHistoricaInput = z.infer<typeof esquemaCrearOrdenHistorica>;
export type RepetirOrdenInput = z.infer<typeof esquemaRepetirOrden>;
export type ActualizarOrdenBorradorInput = z.infer<typeof esquemaActualizarOrdenBorrador>;
export type ConfigurarMetasProcesoInput = z.infer<typeof esquemaConfigurarMetasProceso>;
export type CambiarEstadoOrdenInput = z.infer<typeof esquemaCambiarEstadoOrden>;
export type RegistrarTiempoOperadorInput = z.infer<typeof esquemaRegistrarTiempoOperador>;
export type RegistrarConsumoMaterialInput = z.infer<typeof esquemaRegistrarConsumoMaterial>;
export type RegistrarAvancePartidaInput = z.infer<typeof esquemaRegistrarAvancePartida>;
export type AsignarOperadorPartidaInput = z.infer<typeof esquemaAsignarOperadorPartida>;
