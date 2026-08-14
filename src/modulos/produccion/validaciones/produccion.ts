import { z } from 'zod';
import {
  PIN_LONGITUD_MAXIMA,
  PIN_LONGITUD_MINIMA,
} from '@/nucleo/autenticacion/constantes';
import {
  ESTADOS_KANBAN_PRODUCCION,
  MOTIVOS_PAUSA_SESION,
} from '@/modulos/produccion/tipos/produccion';

const PATRON_PIN_OPERADOR = new RegExp(`^\\d{${PIN_LONGITUD_MINIMA},${PIN_LONGITUD_MAXIMA}}$`);
const ESTADOS_DESTINO_SESION = ['pausada', 'finalizada'] as const;

export const esquemaIniciarSesion = z.object({
  ordenId: z.uuid('ID de orden inválido'),
  partidaId: z.uuid('ID de partida inválido'),
  programacionId: z.uuid('ID de programación inválido'),
}).strict();

export const esquemaCerrarSesion = z
  .object({
    sesionId: z.uuid('ID de sesión inválido'),
    piezasProducidas: z.number().min(0, 'Las piezas producidas no pueden ser negativas'),
    estadoDestino: z.enum(ESTADOS_DESTINO_SESION),
    motivoPausa: z.enum(MOTIVOS_PAUSA_SESION).optional(),
    notas: z.string().trim().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
    pinConfirmacion: z
      .string()
      .regex(PATRON_PIN_OPERADOR, `El PIN debe tener entre ${PIN_LONGITUD_MINIMA} y ${PIN_LONGITUD_MAXIMA} dígitos`),
  })
  .strict()
  .superRefine((valor, contexto) => {
    if (valor.estadoDestino === 'pausada' && !valor.motivoPausa) {
      contexto.addIssue({
        code: 'custom',
        path: ['motivoPausa'],
        message: 'El motivo de pausa es requerido',
      });
    }
  });

export const esquemaPartidaNotaEntrega = z.object({
  partidaId: z.uuid('ID de partida inválido'),
  cantidadEntregada: z.number().positive('La cantidad entregada debe ser mayor a 0'),
}).strict();

export const esquemaCrearNotaEntrega = z.object({
  ordenId: z.uuid('ID de orden inválido'),
  recibidoPor: z.string().trim().min(3, 'El nombre de quien recibe debe tener al menos 3 caracteres'),
  firmaClienteUrl: z.url('La URL de firma no es válida').max(2048).optional(),
  partidas: z.array(esquemaPartidaNotaEntrega).min(1, 'La nota requiere al menos una partida'),
}).strict();

export const esquemaConsultarTableroProduccion = z.object({
  recursoId: z.uuid('ID de recurso inválido').optional(),
  estados: z.array(z.enum(ESTADOS_KANBAN_PRODUCCION)).max(5).optional(),
}).strict();

export type IniciarSesionInput = z.infer<typeof esquemaIniciarSesion>;
export type CerrarSesionInput = z.infer<typeof esquemaCerrarSesion>;
export type PartidaNotaEntregaInput = z.infer<typeof esquemaPartidaNotaEntrega>;
export type CrearNotaEntregaInput = z.infer<typeof esquemaCrearNotaEntrega>;
export type ConsultarTableroProduccionInput = z.infer<typeof esquemaConsultarTableroProduccion>;
