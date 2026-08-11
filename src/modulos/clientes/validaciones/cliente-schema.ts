import { z } from 'zod';

/**
 * RFC mexicano (persona moral: 12; física: 13). Se valida el formato, no la
 * existencia. Se normaliza a mayúsculas antes de validar en el esquema.
 */
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Dirección estructurada (fiscal o de envío). */
export const esquemaDireccion = z.object({
  calle: z.string().min(1, 'Calle requerida'),
  numeroExterior: z.string().min(1, 'Número exterior requerido'),
  numeroInterior: z.string().optional().nullable(),
  colonia: z.string().min(1, 'Colonia requerida'),
  municipio: z.string().min(1, 'Municipio requerido'),
  estado: z.string().min(1, 'Estado requerido'),
  codigoPostal: z.string().regex(/^\d{5}$/, 'Código postal de 5 dígitos'),
  pais: z.string().min(1).default('México'),
});

const rfcOpcional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(RFC_REGEX, 'RFC inválido')
  .optional()
  .or(z.literal(''));

const correoOpcional = z
  .email({ message: 'Correo inválido' })
  .optional()
  .or(z.literal(''));

/**
 * Campos base del cliente SIN defaults, para que `actualizar` (parcial) no
 * reintroduzca valores por omisión al editar solo algunos campos. Los defaults
 * se agregan únicamente en el esquema de alta.
 */
const camposCliente = {
  razonSocial: z.string().trim().min(2, 'Razón social requerida'),
  nombreComercial: z.string().trim().min(2, 'Nombre comercial requerido'),
  rfc: rfcOpcional,
  contacto: z.string().trim().optional(),
  correo: correoOpcional,
  telefono: z.string().trim().optional(),
  condicionesPago: z.enum(['contado', '15_dias', '30_dias', 'credito']).optional(),
  limiteCredito: z.number().nonnegative('El límite no puede ser negativo'),
  estado: z.enum(['prospecto', 'activo', 'inactivo']),
  direccionFiscal: esquemaDireccion.optional().nullable(),
  direccionEnvio: esquemaDireccion.optional().nullable(),
} as const;

/** Alta de cliente. La razón social es obligatoria (deduplica por RFC/razón social). */
export const esquemaCrearCliente = z.object({
  ...camposCliente,
  limiteCredito: camposCliente.limiteCredito.default(0),
  estado: camposCliente.estado.default('activo'),
});

/** Edición de cliente. Requiere `id`; el resto es parcial (solo lo que cambia). */
export const esquemaActualizarCliente = z
  .object(camposCliente)
  .partial()
  .extend({ id: z.uuid('Identificador inválido') });

/**
 * Asignación manual de tier por un admin. La caducidad la fija el servidor
 * (`DIAS_TIER_MANUAL`), no el cliente, para que no se pueda extender a mano.
 */
export const esquemaAsignarTierManual = z.object({
  clienteId: z.uuid('Identificador inválido'),
  tier: z.enum(['bronce', 'plata', 'oro', 'platino']),
});

/** Metadatos de subida de documento (el binario viaja como FormData aparte). */
export const esquemaSubirDocumento = z.object({
  clienteId: z.uuid('Identificador inválido'),
  tipo: z.enum(['csf', 'contrato', 'identificacion', 'comprobante_domicilio', 'otro']),
  nombreArchivo: z.string().trim().min(1, 'Nombre de archivo requerido'),
});

export type CrearClienteInput = z.infer<typeof esquemaCrearCliente>;
export type ActualizarClienteInput = z.infer<typeof esquemaActualizarCliente>;
export type AsignarTierManualInput = z.infer<typeof esquemaAsignarTierManual>;
export type SubirDocumentoInput = z.infer<typeof esquemaSubirDocumento>;
export type DireccionInput = z.infer<typeof esquemaDireccion>;
