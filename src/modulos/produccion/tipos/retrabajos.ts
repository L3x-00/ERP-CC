/** C13.2: retrabajo declarado al cerrar una sesión de producción. */

export const CAUSAS_RETRABAJO = ['operador', 'cliente', 'material', 'otro'] as const;

export type CausaRetrabajo = (typeof CAUSAS_RETRABAJO)[number];

export const ETIQUETAS_CAUSA_RETRABAJO: Record<CausaRetrabajo, string> = {
  operador: 'Error del operador',
  cliente: 'Cambio o error del cliente',
  material: 'Defecto del material',
  otro: 'Otro',
};

/** AUD-01/AUD-04: resultado declarado del retrabajo. */
export const RESULTADOS_RETRABAJO = ['PENDIENTE', 'RECUPERADO', 'SCRAP'] as const;

export type ResultadoRetrabajo = (typeof RESULTADOS_RETRABAJO)[number];

export const ETIQUETAS_RESULTADO_RETRABAJO: Record<ResultadoRetrabajo, string> = {
  PENDIENTE: 'Pendiente de validación',
  RECUPERADO: 'Recuperado',
  SCRAP: 'Scrap definitivo',
};

export interface RetrabajoRegistrado {
  id: string;
  ordenId: string;
  partidaId: string;
  /** Id canónico: catálogo actual o, en filas históricas, material legado. */
  materialId: string;
  catalogoMaterialId: string | null;
  cantidadUsada: number;
  cantidadScrap: number;
  minutos: number;
  causa: CausaRetrabajo;
  motivo: string;
  resultado: ResultadoRetrabajo;
  creadoEn: string;
}

/** Retrabajo con contexto para la vista administrativa. */
export type RetrabajoDetalle = RetrabajoRegistrado & {
  materialCodigo: string;
  materialNombre: string;
  unidadBase: string;
  codigoPieza: string;
  registradoPorNombre: string;
  notas: string | null;
};
