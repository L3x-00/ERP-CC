import { z } from 'zod';

/**
 * RFC mexicano (persona moral: 12; física: 13). Se valida el formato, no la
 * existencia. Se normaliza a mayúsculas antes de validar en el esquema.
 */
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/** Moneda comercial del cliente (SII-B2.4). */
export const MONEDAS_CLIENTE = ['MXN', 'USD'] as const;

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
 * Coherencia crédito/días (SII-B2.4): con crédito los días son 1..365; sin
 * crédito deben ser 0 (o nulos). El servidor normaliza antes de persistir.
 */
function validarCoherenciaCredito(
  datos: { creditoHabilitado?: boolean; diasCredito?: number | null },
  contexto: z.RefinementCtx,
): void {
  const { creditoHabilitado, diasCredito } = datos;
  if (creditoHabilitado === true && diasCredito === null) {
    contexto.addIssue({
      code: 'custom',
      path: ['diasCredito'],
      message: 'Indica los días de crédito',
    });
  }
  if (
    creditoHabilitado === true &&
    diasCredito !== undefined &&
    diasCredito !== null &&
    (diasCredito < 1 || diasCredito > 365)
  ) {
    contexto.addIssue({
      code: 'custom',
      path: ['diasCredito'],
      message: 'Los días de crédito deben estar entre 1 y 365',
    });
  }
  if (creditoHabilitado === false && diasCredito != null && diasCredito !== 0) {
    contexto.addIssue({
      code: 'custom',
      path: ['diasCredito'],
      message: 'Sin crédito los días deben ser 0',
    });
  }
}

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
  moneda: z.enum(MONEDAS_CLIENTE).optional(),
  creditoHabilitado: z.boolean().optional(),
  diasCredito: z.number().int('Días de crédito inválidos').min(0).max(365).nullable().optional(),
  direccionFiscal: esquemaDireccion.optional().nullable(),
  direccionEnvio: esquemaDireccion.optional().nullable(),
} as const;

/** Contacto principal capturado en el formulario maestro de alta (SII-B2.2). */
export const esquemaContactoPrincipal = z.object({
  nombre: z.string().trim().min(2, 'Nombre del contacto requerido').max(120),
  puesto: z.string().trim().max(80).optional().or(z.literal('')),
  correo: correoOpcional,
  telefono: z.string().trim().max(40).optional().or(z.literal('')),
});

/** Alta de cliente. La razón social es obligatoria (deduplica por RFC/razón social). */
export const esquemaCrearCliente = z
  .object({
    ...camposCliente,
    limiteCredito: camposCliente.limiteCredito.default(0),
    estado: camposCliente.estado.default('activo'),
    contactoPrincipal: esquemaContactoPrincipal.optional(),
  })
  .superRefine(validarCoherenciaCredito);

/**
 * Edición de cliente. Requiere `id`; el resto es parcial (solo lo que cambia).
 * El estado NO se edita aquí: cambia solo por `cambiar_estado_cliente`.
 */
export const esquemaActualizarCliente = z
  .object(camposCliente)
  .omit({ estado: true })
  .partial()
  .extend({ id: z.uuid('Identificador inválido') })
  .superRefine(validarCoherenciaCredito);

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
  /**
   * Nombre ERP forzado: reemplazar un documento conserva su clave de
   * versionado aunque el binario elegido tenga otro nombre de archivo.
   */
  nombreErp: z.string().trim().min(1).max(255).optional(),
});

/**
 * Contacto adicional del cliente — OBS-02. Nombre obligatorio; el resto
 * opcional con longitudes acotadas. `esPrincipal` marca el contacto de cabecera
 * (a lo sumo uno por cliente, garantizado por índice parcial en la base).
 */
export const esquemaCrearContactoCliente = z
  .object({
    clienteId: z.uuid('Identificador inválido'),
    nombre: z.string().trim().min(2, 'Nombre del contacto requerido').max(120),
    puesto: z.string().trim().max(80).optional().or(z.literal('')),
    correo: correoOpcional,
    telefono: z.string().trim().max(40).optional().or(z.literal('')),
    notas: z.string().trim().max(300).optional().or(z.literal('')),
    esPrincipal: z.boolean().default(false),
  })
  .strict();

/** Baja de un contacto adicional (legado OBS-02); la UI usa baja lógica. */
export const esquemaEliminarContactoCliente = z
  .object({
    id: z.uuid('Identificador inválido'),
    clienteId: z.uuid('Identificador inválido'),
  })
  .strict();

/** Marca de contacto principal (SII-B2.3). */
export const esquemaMarcarContactoPrincipal = z
  .object({
    id: z.uuid('Identificador inválido'),
    clienteId: z.uuid('Identificador inválido'),
  })
  .strict();

/** Baja lógica de contacto con motivo y CAS sobre `actualizado_en`. */
export const esquemaDesactivarContactoCliente = z
  .object({
    id: z.uuid('Identificador inválido'),
    clienteId: z.uuid('Identificador inválido'),
    motivo: z.string().trim().min(3, 'Indica el motivo de la baja').max(300),
    actualizadoEn: z.string().min(1, 'Falta la versión del contacto'),
  })
  .strict();

/** Reactivación de un contacto con baja lógica. */
export const esquemaReactivarContactoCliente = z
  .object({
    id: z.uuid('Identificador inválido'),
    clienteId: z.uuid('Identificador inválido'),
  })
  .strict();

/** Cambio de estado del cliente (SII-B2.5): CAS + motivo para inactivar. */
export const esquemaCambiarEstadoCliente = z
  .object({
    clienteId: z.uuid('Identificador inválido'),
    nuevoEstado: z.enum(['prospecto', 'activo', 'inactivo']),
    motivo: z.string().trim().max(300).optional(),
    actualizadoEn: z.string().min(1, 'Falta la versión del cliente'),
  })
  .strict();

export type CrearContactoClienteInput = z.infer<typeof esquemaCrearContactoCliente>;
export type EliminarContactoClienteInput = z.infer<typeof esquemaEliminarContactoCliente>;
export type MarcarContactoPrincipalInput = z.infer<typeof esquemaMarcarContactoPrincipal>;
export type DesactivarContactoClienteInput = z.infer<typeof esquemaDesactivarContactoCliente>;
export type ReactivarContactoClienteInput = z.infer<typeof esquemaReactivarContactoCliente>;

export type CrearClienteInput = z.infer<typeof esquemaCrearCliente>;
export type ActualizarClienteInput = z.infer<typeof esquemaActualizarCliente>;
export type AsignarTierManualInput = z.infer<typeof esquemaAsignarTierManual>;
export type SubirDocumentoInput = z.infer<typeof esquemaSubirDocumento>;
export type CambiarEstadoClienteInput = z.infer<typeof esquemaCambiarEstadoCliente>;
export type DireccionInput = z.infer<typeof esquemaDireccion>;
