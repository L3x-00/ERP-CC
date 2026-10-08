import { z } from 'zod';

import { ENTIDADES_CATALOGO } from '@/modulos/catalogos/tipos/indice';

const CODIGO_CATALOGO = /^[A-Z0-9][A-Z0-9_-]{1,48}$/;
const PREFIJO_CORRIDA = /^[A-Z]{2,4}$/;

const codigoCatalogo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CODIGO_CATALOGO, 'El código no es válido (mayúsculas, números, guion y guion bajo)');

const nombreCatalogo = z.string().trim().min(2, 'El nombre es requerido').max(120);

const ordenCatalogo = z.number().int().min(0, 'El orden no puede ser negativo').max(99_999);

const idOpcional = z.uuid('ID inválido').optional();

/** Material editable (B1.3). */
export const esquemaGuardarMaterial = z
  .object({
    id: idOpcional,
    codigo: codigoCatalogo,
    nombre: nombreCatalogo,
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Espesor dependiente del material (B1.4). */
export const esquemaGuardarEspesor = z
  .object({
    id: idOpcional,
    materialId: z.uuid('Material inválido'),
    etiqueta: z.string().trim().min(1, 'La etiqueta es requerida').max(40),
    espesorMm: z
      .number({ message: 'El espesor debe ser numérico' })
      .refine(Number.isFinite, 'El espesor debe ser finito')
      .gt(0, 'El espesor debe ser mayor que cero')
      .max(99_999.999, 'El espesor excede el máximo soportado'),
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Proceso (B1.5) con sus banderas configurables de RFQ y B6. */
export const esquemaGuardarProceso = z
  .object({
    id: idOpcional,
    codigo: codigoCatalogo,
    nombre: nombreCatalogo,
    prefijoCorrida: z
      .string()
      .trim()
      .toUpperCase()
      .regex(PREFIJO_CORRIDA, 'El prefijo de corrida debe ser de 2 a 4 letras'),
    grupoPlaneadoId: z.uuid('Grupo planeado inválido').nullish(),
    areaTrabajoCodigo: codigoCatalogo.nullish(),
    requiereArchivoTecnico: z.boolean().default(true),
    requierePrimeraPieza: z.boolean().default(false),
    intervaloInspeccionLote: z
      .union([z.literal(10), z.literal(20), z.null()])
      .default(null),
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Grupo de equipo (B1.6). */
export const esquemaGuardarGrupoEquipo = z
  .object({
    id: idOpcional,
    codigo: codigoCatalogo,
    nombre: nombreCatalogo,
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Grupo planeado (B1.6). */
export const esquemaGuardarGrupoPlaneado = esquemaGuardarGrupoEquipo;

/** Próxima acción comercial (B1.7); solo una puede ser "Otro". */
export const esquemaGuardarProximaAccion = z
  .object({
    id: idOpcional,
    codigo: codigoCatalogo,
    nombre: nombreCatalogo,
    esOtro: z.boolean().default(false),
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Canal de origen del RFQ (DC-02); solo uno puede ser "Otro". */
export const esquemaGuardarCanal = z
  .object({
    id: idOpcional,
    codigo: codigoCatalogo,
    nombre: nombreCatalogo,
    esOtro: z.boolean().default(false),
    activo: z.boolean().default(true),
    orden: ordenCatalogo.default(0),
  })
  .strict();

/** Alternar activo/inactivo sin exponer DELETE (regla de oro del catálogo). */
export const esquemaAlternarActivo = z
  .object({
    entidad: z.enum(ENTIDADES_CATALOGO),
    id: z.uuid('ID inválido'),
    activo: z.boolean(),
  })
  .strict();

/** Entrada base de las consultas de catálogo (la UI muestra activos e inactivos). */
export const esquemaConsultaCatalogosBase = z
  .object({ soloActivos: z.boolean().default(false) })
  .strict();

/** Historial de versiones de un registro concreto. */
export const esquemaListarVersiones = z
  .object({
    entidad: z.enum(ENTIDADES_CATALOGO),
    entidadId: z.uuid('ID inválido'),
  })
  .strict();

export type GuardarMaterialInput = z.infer<typeof esquemaGuardarMaterial>;
export type GuardarEspesorInput = z.infer<typeof esquemaGuardarEspesor>;
export type GuardarProcesoInput = z.infer<typeof esquemaGuardarProceso>;
export type GuardarGrupoEquipoInput = z.infer<typeof esquemaGuardarGrupoEquipo>;
export type GuardarGrupoPlaneadoInput = z.infer<typeof esquemaGuardarGrupoPlaneado>;
export type GuardarProximaAccionInput = z.infer<typeof esquemaGuardarProximaAccion>;
export type GuardarCanalInput = z.infer<typeof esquemaGuardarCanal>;
export type AlternarActivoInput = z.infer<typeof esquemaAlternarActivo>;
export type ConsultaCatalogosBaseInput = z.infer<typeof esquemaConsultaCatalogosBase>;
export type ListarVersionesInput = z.infer<typeof esquemaListarVersiones>;
