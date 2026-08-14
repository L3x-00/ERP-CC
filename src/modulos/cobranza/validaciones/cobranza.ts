import { z } from 'zod';
import {
  ESTADOS_CUENTA_POR_COBRAR,
  MONEDAS_COBRANZA,
} from '@/modulos/cobranza/tipos/cobranza';

/**
 * Validaciones Zod v4 de Cobranza (Fase 8). Todo objeto externo es `.strict()`
 * para rechazar claves inesperadas. Los montos siguen el contrato SQL
 * `numeric(12,4)` / `numeric(10,4)`: positivos, finitos y con a lo sumo cuatro
 * decimales lógicos. `montoAAplicar` de saldo a favor y los movimientos del
 * monedero se expresan en MXN; el nombre lo declara sin comentarios redundantes.
 */

/** Métodos admitidos al registrar un pago externo; `saldo_a_favor` es interno. */
const METODOS_PAGO_EXTERNO = ['transferencia', 'efectivo', 'cheque', 'tarjeta'] as const;

// numeric(12,4): hasta 8 enteros + 4 decimales.
const MONTO_MAXIMO = 99_999_999.9999;
// numeric(10,4): hasta 6 enteros + 4 decimales.
const TIPO_CAMBIO_MAXIMO = 999_999.9999;
const DECIMALES_MAXIMOS = 4;
const FACTOR_DECIMALES = 10 ** DECIMALES_MAXIMOS;

/** ¿El valor cabe en cuatro decimales sin pérdida perceptible? */
function tieneMaximoCuatroDecimales(valor: number): boolean {
  const escalado = valor * FACTOR_DECIMALES;

  return Number.isFinite(escalado) && Math.abs(escalado - Math.round(escalado)) < 1e-6;
}

function montoMonetario(maximo: number, etiqueta: string) {
  return z
    .number()
    .refine((valor) => Number.isFinite(valor), `El ${etiqueta} debe ser un número finito`)
    .refine((valor) => valor > 0, `El ${etiqueta} debe ser mayor a 0`)
    .refine((valor) => valor <= maximo, `El ${etiqueta} excede el máximo permitido`)
    .refine(tieneMaximoCuatroDecimales, `El ${etiqueta} admite máximo 4 decimales`);
}

const montoPositivo = (etiqueta: string) => montoMonetario(MONTO_MAXIMO, etiqueta);
const tipoCambioPositivo = montoMonetario(TIPO_CAMBIO_MAXIMO, 'tipo de cambio');

export const esquemaCrearCuentaPorCobrar = z
  .object({
    ordenId: z.uuid('ID de orden inválido'),
    montoTotal: montoPositivo('monto total'),
    moneda: z.enum(MONEDAS_COBRANZA),
    tipoCambioOrigen: tipoCambioPositivo,
    fechaVencimiento: z.iso.datetime({ message: 'La fecha de vencimiento no es válida' }),
    folioFacturaRemision: z
      .string()
      .trim()
      .min(1, 'El folio no puede estar vacío')
      .max(60, 'El folio no puede exceder 60 caracteres')
      .optional(),
  })
  .strict();

export const esquemaRegistrarPago = z
  .object({
    arId: z.uuid('ID de cuenta por cobrar inválido'),
    montoPagado: montoPositivo('monto pagado'),
    monedaPago: z.enum(MONEDAS_COBRANZA),
    tipoCambioPago: tipoCambioPositivo,
    metodoPago: z.enum(METODOS_PAGO_EXTERNO),
    referenciaBancaria: z
      .string()
      .trim()
      .min(1, 'La referencia no puede estar vacía')
      .max(120, 'La referencia no puede exceder 120 caracteres')
      .optional(),
    cuentaBancariaId: z.uuid('ID de cuenta bancaria inválido').optional(),
    notas: z.string().trim().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
    // UUID de la intención del navegador: garantiza idempotencia del cobro.
    solicitudId: z.uuid('ID de solicitud inválido'),
  })
  .strict();

export const esquemaAplicarSaldoFavor = z
  .object({
    clienteId: z.uuid('ID de cliente inválido'),
    arId: z.uuid('ID de cuenta por cobrar inválido'),
    // Importe del monedero (MXN) que se debita para aplicar a la cuenta.
    montoAAplicar: montoPositivo('monto a aplicar'),
    solicitudId: z.uuid('ID de solicitud inválido'),
  })
  .strict();

export const esquemaConsultarCartera = z
  .object({
    clienteId: z.uuid('ID de cliente inválido').optional(),
    estados: z.array(z.enum(ESTADOS_CUENTA_POR_COBRAR)).min(1).max(4).optional(),
    moneda: z.enum(MONEDAS_COBRANZA).optional(),
    fechaReferencia: z.iso.datetime({ message: 'La fecha de referencia no es válida' }).optional(),
    soloVencidas: z.boolean().optional(),
  })
  .strict();

export type CrearCuentaPorCobrarInput = z.infer<typeof esquemaCrearCuentaPorCobrar>;
export type RegistrarPagoInput = z.infer<typeof esquemaRegistrarPago>;
export type AplicarSaldoFavorInput = z.infer<typeof esquemaAplicarSaldoFavor>;
export type ConsultarCarteraInput = z.infer<typeof esquemaConsultarCartera>;
