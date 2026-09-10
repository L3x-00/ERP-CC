import { z } from 'zod';

const RFC_MEXICANO = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

const numeroFinito = (etiqueta: string, minimo: number, maximo: number) =>
  z
    .number({ message: `${etiqueta} debe ser numérico` })
    .refine(Number.isFinite, `${etiqueta} debe ser finito`)
    .min(minimo, `${etiqueta} no puede ser menor que ${minimo}`)
    .max(maximo, `${etiqueta} no puede superar ${maximo}`);

const urlHttpOpcional = z
  .union([
    z
      .url({ message: 'La URL del logo no es válida' })
      .refine((valor) => /^https?:\/\//i.test(valor), 'La URL debe usar HTTP o HTTPS'),
    z.literal(''),
    z.null(),
  ])
  .optional();

/** Datos fiscales y de contacto visibles en documentos del sistema. */
export const esquemaConfiguracionEmpresa = z
  .object({
    nombre: z.string().trim().min(2, 'El nombre es requerido').max(160),
    razonSocial: z.string().trim().min(2, 'La razón social es requerida').max(200),
    rfc: z.string().trim().toUpperCase().regex(RFC_MEXICANO, 'El RFC mexicano no es válido'),
    direccion: z.string().trim().min(3, 'La dirección es requerida').max(300),
    telefono: z.string().trim().max(40).default(''),
    email: z.union([z.email({ message: 'El correo no es válido' }), z.literal('')]).default(''),
    logoUrl: urlHttpOpcional,
  })
  .strict();

/** Parámetros base consumidos por cotizador y rentabilidad futura. */
export const esquemaTarifasCotizador = z
  .object({
    costoHoraDefault: numeroFinito('El costo por hora', 0, 99_999_999.99),
    segundosPorPierce: numeroFinito('Los segundos por pierce', 0.01, 3_600),
    factorEficienciaLaser: numeroFinito('El factor de eficiencia láser', 0.01, 1),
    factorMermaMaterial: numeroFinito('El factor de merma', 0, 1),
    margenUtilidadDefault: numeroFinito('El margen de utilidad', 0, 100),
  })
  .strict();

/** Plantilla T1 que puede guardarse dentro del bloque de plantillas JSONB. */
export const esquemaPlantillaDocumento = z
  .object({
    clave: z.string().trim().min(1).max(40).default('T1'),
    colorAcento: z.string().regex(HEX_COLOR, 'El color de acento debe ser hexadecimal'),
    terminosCondiciones: z.string().trim().min(1).max(5_000),
    textoPiePagina: z.string().trim().max(500),
    textoEncabezado: z.string().trim().max(200),
  })
  .strict();

/** Cuenta bancaria para cobros/pagos; no se permiten campos extra del cliente. */
export const esquemaCuentaBancaria = z
  .object({
    banco: z.string().trim().min(2, 'El banco es requerido').max(120),
    numeroCuenta: z.string().trim().min(4, 'El número de cuenta es requerido').max(50),
    clabe: z
      .union([z.string().trim().regex(/^\d{18}$/, 'La CLABE debe contener 18 dígitos'), z.literal(''), z.null()])
      .optional(),
    moneda: z.enum(['MXN', 'USD']),
    titular: z.string().trim().min(2, 'El titular es requerido').max(160),
    activa: z.boolean().default(true),
  })
  .strict();

/** Entrada de cuenta para alta o actualización (el id solo aparece al editar). */
export const esquemaGuardarCuentaBancaria = esquemaCuentaBancaria
  .extend({ id: z.uuid('ID de cuenta bancaria inválido').optional() })
  .strict();

export const esquemaTipoCambio = z
  .object({
    tipoCambioUsd: numeroFinito('El tipo de cambio USD', 0.0001, 999_999.9999),
  })
  .strict();

export const esquemaAreaTrabajo = z
  .object({
    id: z.uuid('ID de área inválido').optional(),
    codigo: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,48}$/, 'El código de área no es válido'),
    nombre: z.string().trim().min(2, 'El nombre del área es requerido').max(120),
    colorHex: z.string().regex(HEX_COLOR, 'El color del área debe ser hexadecimal'),
    costoHoraInterno: numeroFinito('El costo interno', 0, 99_999_999.99),
    tarifaHoraVenta: numeroFinito('La tarifa de venta', 0, 99_999_999.99),
    esExterno: z.boolean().default(false),
    activo: z.boolean().default(true),
    orden: z.number().int().min(0).max(99_999).default(0),
  })
  .strict();

export const esquemaConsultaConfiguracion = z
  .object({ soloCuentasActivas: z.boolean().default(true) })
  .strict();

export type ConfiguracionEmpresaInput = z.infer<typeof esquemaConfiguracionEmpresa>;
export type TarifasCotizadorInput = z.infer<typeof esquemaTarifasCotizador>;
export type PlantillaDocumentoInput = z.infer<typeof esquemaPlantillaDocumento>;
export type CuentaBancariaInput = z.infer<typeof esquemaCuentaBancaria>;
export type GuardarCuentaBancariaInput = z.infer<typeof esquemaGuardarCuentaBancaria>;
export type TipoCambioInput = z.infer<typeof esquemaTipoCambio>;
export type AreaTrabajoInput = z.infer<typeof esquemaAreaTrabajo>;
export type ConsultaConfiguracionInput = z.infer<typeof esquemaConsultaConfiguracion>;
