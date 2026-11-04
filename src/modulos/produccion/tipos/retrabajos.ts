/** C13.2: retrabajo declarado al cerrar una sesión de producción. */

export const CAUSAS_RETRABAJO = ['operador', 'cliente', 'material', 'otro'] as const;

export type CausaRetrabajo = (typeof CAUSAS_RETRABAJO)[number];

export const ETIQUETAS_CAUSA_RETRABAJO: Record<CausaRetrabajo, string> = {
  operador: 'Error del operador',
  cliente: 'Cambio o error del cliente',
  material: 'Defecto del material',
  otro: 'Otro',
};

export interface RetrabajoRegistrado {
  id: string;
  ordenId: string;
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  minutos: number;
  causa: CausaRetrabajo;
  motivo: string;
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
