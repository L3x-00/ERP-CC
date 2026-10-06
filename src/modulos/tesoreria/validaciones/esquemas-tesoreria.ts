import { z } from 'zod';

import { ENTIDADES_TESORERIA } from '@/modulos/tesoreria/tipos/indice';

const uuid = z.uuid('Identificador inválido');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');

export const esquemaSaldoInicial = z
  .object({
    cuentaId: uuid,
    monto: z.number().nonnegative('El saldo no puede ser negativo').max(1_000_000_000),
    moneda: z.enum(['MXN', 'USD']),
    tipoCambio: z.number().positive('Tipo de cambio inválido').max(1_000_000),
    fecha,
  })
  .strict()
  .refine((datos) => datos.moneda !== 'MXN' || datos.tipoCambio === 1, {
    message: 'Un saldo en MXN exige tipo de cambio 1',
  });

export const esquemaTransferencia = z
  .object({
    cuentaOrigenId: uuid,
    cuentaDestinoId: uuid,
    monto: z.number().positive('El monto debe ser mayor a 0').max(1_000_000_000),
    referencia: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .refine((datos) => datos.cuentaOrigenId !== datos.cuentaDestinoId, {
    message: 'La cuenta destino debe ser distinta a la origen',
  });

export const esquemaConciliacion = z
  .object({
    cuentaId: uuid,
    entidad: z.enum(ENTIDADES_TESORERIA),
    entidadId: uuid,
  })
  .strict();

export const esquemaDesconciliacion = z
  .object({
    entidad: z.enum(ENTIDADES_TESORERIA),
    entidadId: uuid,
  })
  .strict();

export type SaldoInicialInput = z.infer<typeof esquemaSaldoInicial>;
export type TransferenciaInput = z.infer<typeof esquemaTransferencia>;
export type ConciliacionInput = z.infer<typeof esquemaConciliacion>;
export type DesconciliacionInput = z.infer<typeof esquemaDesconciliacion>;
