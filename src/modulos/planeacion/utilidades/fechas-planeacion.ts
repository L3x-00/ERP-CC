/**
 * Utilidades de fecha y rango para las vistas de Planeación. Todo se calcula en
 * UTC a partir de ISO `YYYY-MM-DD` para que el resultado no dependa de la zona
 * horaria del servidor ni del navegador (el calendario se hidrata).
 */

export const VISTAS_PLANEACION = ['dia', 'semana', 'mes'] as const;

export type VistaPlaneacion = (typeof VISTAS_PLANEACION)[number];

export interface RangoFechas {
  fechaInicio: string;
  fechaFin: string;
}

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

function fechaDesdeIso(fechaIso: string): Date {
  return new Date(`${fechaIso}T00:00:00.000Z`);
}

function isoDesdeFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Fecha local de hoy en ISO, para el botón "Hoy" sin corrimiento por zona. */
export function hoyIso(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function sumarDias(fechaIso: string, dias: number): string {
  const fecha = fechaDesdeIso(fechaIso);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return isoDesdeFecha(fecha);
}

/** Lunes de la semana ISO que contiene la fecha. */
export function inicioSemana(fechaIso: string): string {
  const fecha = fechaDesdeIso(fechaIso);
  const diferencia = (fecha.getUTCDay() + 6) % 7;
  return sumarDias(fechaIso, -diferencia);
}

export function finSemana(fechaIso: string): string {
  return sumarDias(inicioSemana(fechaIso), 6);
}

export function inicioMes(fechaIso: string): string {
  return `${fechaIso.slice(0, 7)}-01`;
}

export function finMes(fechaIso: string): string {
  const fecha = fechaDesdeIso(inicioMes(fechaIso));
  fecha.setUTCMonth(fecha.getUTCMonth() + 1);
  fecha.setUTCDate(0);
  return isoDesdeFecha(fecha);
}

export function esFinDeSemana(fechaIso: string): boolean {
  const dia = fechaDesdeIso(fechaIso).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Rango natural de cada vista anclado a una fecha de referencia. */
export function rangoVista(vista: VistaPlaneacion, fechaReferencia: string): RangoFechas {
  if (vista === 'dia') {
    return { fechaInicio: fechaReferencia, fechaFin: fechaReferencia };
  }

  if (vista === 'semana') {
    const fechaInicio = inicioSemana(fechaReferencia);
    return { fechaInicio, fechaFin: sumarDias(fechaInicio, 6) };
  }

  return { fechaInicio: inicioMes(fechaReferencia), fechaFin: finMes(fechaReferencia) };
}

function sumarMeses(fechaIso: string, meses: number): string {
  const fecha = fechaDesdeIso(inicioMes(fechaIso));
  fecha.setUTCMonth(fecha.getUTCMonth() + meses);
  return isoDesdeFecha(fecha);
}

/** Desplaza el rango completo según la vista: un día, una semana o un mes. */
export function navegarRango(
  vista: VistaPlaneacion,
  rangoActual: RangoFechas,
  direccion: -1 | 1,
): RangoFechas {
  if (vista === 'dia') {
    const fecha = sumarDias(rangoActual.fechaInicio, direccion);
    return { fechaInicio: fecha, fechaFin: fecha };
  }

  if (vista === 'semana') {
    const fechaInicio = sumarDias(rangoActual.fechaInicio, direccion * 7);
    return { fechaInicio, fechaFin: sumarDias(fechaInicio, 6) };
  }

  return rangoVista('mes', sumarMeses(rangoActual.fechaInicio, direccion));
}

/** Días ISO consecutivos entre dos fechas, ambas incluidas. */
export function diasEntre(fechaInicio: string, fechaFin: string): string[] {
  const dias: string[] = [];
  let actual = fechaInicio;
  let guarda = 0;
  while (actual <= fechaFin && guarda < 400) {
    dias.push(actual);
    actual = sumarDias(actual, 1);
    guarda += 1;
  }
  return dias;
}

export interface CeldaMes {
  fecha: string;
  /** `false` para los días de relleno que no pertenecen al rango consultado. */
  enRango: boolean;
}

/** Rejilla de lunes a domingo que cubre el rango consultado, con relleno. */
export function construirCeldasMes(fechaInicio: string, fechaFin: string): CeldaMes[] {
  if (fechaInicio > fechaFin) return [];
  const celdas: CeldaMes[] = [];
  let actual = inicioSemana(fechaInicio);
  const limite = finSemana(fechaFin);
  let guarda = 0;
  while (actual <= limite && guarda < 70) {
    celdas.push({ fecha: actual, enRango: actual >= fechaInicio && actual <= fechaFin });
    actual = sumarDias(actual, 1);
    guarda += 1;
  }
  return celdas;
}

/** Etiqueta corta y estable para encabezados: `lun 15 sep`. */
export function etiquetaDia(fechaIso: string): string {
  const fecha = fechaDesdeIso(fechaIso);
  const dia = DIAS_CORTOS[fecha.getUTCDay()];
  const mes = MESES_CORTOS[fecha.getUTCMonth()];
  return `${dia} ${fecha.getUTCDate()} ${mes}`;
}

/** Etiqueta de mes completa: `septiembre 2026`. */
export function etiquetaMes(fechaIso: string): string {
  const fecha = fechaDesdeIso(fechaIso);
  return `${MESES_LARGOS[fecha.getUTCMonth()]} ${fecha.getUTCFullYear()}`;
}

export function etiquetaRango(rango: RangoFechas): string {
  return rango.fechaInicio === rango.fechaFin
    ? etiquetaDia(rango.fechaInicio)
    : `${rango.fechaInicio} a ${rango.fechaFin}`;
}
