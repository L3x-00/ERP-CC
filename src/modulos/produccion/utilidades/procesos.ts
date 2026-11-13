/**
 * Vocabulario de procesos del piso: la etiqueta de piezas y el checklist de
 * inicio cambian según la familia del proceso, no según la pantalla.
 */

export type FamiliaProceso =
  | 'corte'
  | 'doblado'
  | 'soldadura'
  | 'maquinado'
  | 'acabado'
  | 'ensamble'
  | 'otro';

const PIEZAS_POR_FAMILIA: Record<FamiliaProceso, string> = {
  corte: 'Piezas cortadas',
  doblado: 'Piezas dobladas',
  soldadura: 'Piezas soldadas',
  maquinado: 'Piezas maquinadas',
  acabado: 'Piezas acabadas',
  ensamble: 'Piezas ensambladas',
  otro: 'Piezas producidas',
};

const VERBO_POR_FAMILIA: Record<FamiliaProceso, string> = {
  corte: 'cortar',
  doblado: 'doblar',
  soldadura: 'soldar',
  maquinado: 'maquinar',
  acabado: 'acabar',
  ensamble: 'ensamblar',
  otro: 'producir',
};

function normalizar(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Familia de un proceso a partir de su área macro o de su nombre. */
export function familiaProceso(
  procesoNombre: string | null | undefined,
  areaMacro?: string | null,
): FamiliaProceso {
  const area = normalizar(areaMacro);
  if (area === 'corte') return 'corte';
  if (area === 'doblado') return 'doblado';
  if (area === 'soldadura') return 'soldadura';
  if (area === 'maquinado') return 'maquinado';
  if (area === 'acabado') return 'acabado';
  if (area === 'ensamble') return 'ensamble';

  const nombre = normalizar(procesoNombre);
  if (nombre.includes('doblad') || nombre === 'dob') return 'doblado';
  if (nombre.includes('laser') || nombre.includes('corte') || nombre.includes('router')) return 'corte';
  if (nombre.includes('soldad')) return 'soldadura';
  if (nombre.includes('maquinad') || nombre.includes('fabrica')) return 'maquinado';
  if (nombre.includes('acab')) return 'acabado';
  if (nombre.includes('ensambl')) return 'ensamble';
  return 'otro';
}

/** Etiqueta de piezas para cerrar la sesión: «Piezas dobladas», «Piezas cortadas»… */
export function etiquetaPiezasProceso(
  procesoNombre: string | null | undefined,
  areaMacro?: string | null,
): string {
  return PIEZAS_POR_FAMILIA[familiaProceso(procesoNombre, areaMacro)];
}

/** Verbo para guiar al operador: «disponibles para doblar». */
export function verboProceso(
  procesoNombre: string | null | undefined,
  areaMacro?: string | null,
): string {
  return VERBO_POR_FAMILIA[familiaProceso(procesoNombre, areaMacro)];
}

export type ClaveChecklistInicio =
  | 'material'
  | 'espesor'
  | 'cantidad'
  | 'archivo'
  | 'proceso_equipo';

export interface CampoChecklistInicio {
  clave: ClaveChecklistInicio;
  etiqueta: string;
}

export const CAMPOS_CHECKLIST_COMPLETO: readonly CampoChecklistInicio[] = [
  { clave: 'material', etiqueta: 'Material verificado' },
  { clave: 'espesor', etiqueta: 'Espesor verificado' },
  { clave: 'cantidad', etiqueta: 'Cantidad verificada' },
  { clave: 'archivo', etiqueta: 'Revisión / archivo vigente' },
  { clave: 'proceso_equipo', etiqueta: 'Proceso / equipo correcto' },
];

export const CAMPOS_CHECKLIST_DOBLADO: readonly CampoChecklistInicio[] = [
  { clave: 'material', etiqueta: 'Todo el material está listo para este proceso' },
  { clave: 'cantidad', etiqueta: 'La cantidad recibida coincide con lo indicado' },
  { clave: 'proceso_equipo', etiqueta: 'El equipo está configurado para este proceso' },
];

/** Checklist que corresponde a la familia del proceso que se va a iniciar. */
export function camposChecklistInicio(
  procesoNombre: string | null | undefined,
  areaMacro?: string | null,
): readonly CampoChecklistInicio[] {
  return familiaProceso(procesoNombre, areaMacro) === 'doblado'
    ? CAMPOS_CHECKLIST_DOBLADO
    : CAMPOS_CHECKLIST_COMPLETO;
}
