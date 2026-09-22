/**
 * OBS-14/D-13: vocabulario de la taxonomía de taller. Vive en un módulo hoja
 * (sin imports) para que tipos y validaciones lo compartan sin ciclos.
 */

export const TIPOS_AREA_TRABAJO = ['area', 'subarea', 'proceso'] as const;
export type TipoAreaTrabajo = (typeof TIPOS_AREA_TRABAJO)[number];

export const AREAS_PLANEACION_CATALOGO = ['sheet_metal', 'taller', 'acabados', 'ext'] as const;
export type AreaPlaneacionCatalogo = (typeof AREAS_PLANEACION_CATALOGO)[number];
