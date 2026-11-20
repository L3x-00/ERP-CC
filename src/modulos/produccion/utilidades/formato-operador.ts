/** C10: formato de fechas, horas y turnos del espacio de operador. */

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const DIAS_LARGOS = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado',
] as const;
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

const TURNOS: Record<string, string> = {
  matutino: 'Matutino',
  vespertino: 'Vespertino',
  nocturno: 'Nocturno',
};

/**
 * Parsea `YYYY-MM-DD` a mediodía local: evita que la zona horaria del taller
 * desplace el día al formatear (documento 24 oct, no 23 oct).
 */
export function fechaDia(fecha: string): Date {
  return new Date(`${fecha.slice(0, 10)}T12:00:00`);
}

export function etiquetaDiaCorto(fecha: string): string {
  const dia = fechaDia(fecha);
  return `${DIAS_CORTOS[dia.getDay()]} ${dia.getDate()} ${MESES_CORTOS[dia.getMonth()]}`;
}

export function etiquetaDiaLargo(fecha: string): string {
  const dia = fechaDia(fecha);
  return `${DIAS_LARGOS[dia.getDay()]} ${dia.getDate()} de ${MESES_LARGOS[dia.getMonth()]}`;
}

/** Fecha y hora local de una marca de tiempo ISO (`2026-10-25T14:30:00Z`). */
export function etiquetaFechaHora(marca: string | null): string {
  if (!marca) return 'sin cierre';
  const fecha = new Date(marca);
  if (Number.isNaN(fecha.getTime())) return 'fecha inválida';
  return `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]} · ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}

/**
 * C31/A1: fecha y hora en la zona de negocio (Tijuana). `etiquetaFechaHora`
 * usa la zona del navegador; un operador fuera de Tijuana vería otro día.
 */
export function etiquetaFechaHoraNegocio(marca: string | null): string {
  if (!marca) return 'sin fecha registrada';
  const fecha = new Date(marca);
  if (Number.isNaN(fecha.getTime())) return 'fecha inválida';
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Tijuana',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha).replace('.', '');
}

/** Horas con un decimal cuando hace falta (`8 h`, `1.5 h`, `0.25 h`). */
export function horasLegibles(horas: number): string {
  if (!Number.isFinite(horas)) return '—';
  const redondeado = Math.round(horas * 100) / 100;
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(redondeado)} h`;
}

/**
 * Duración real de un bloque de pausa, en horas, truncada a minutos completos.
 *
 * El servidor rechaza cualquier tiempo real mayor al que duró la sesión pausada
 * (`horas_reales_exceden_sesion`). El máximo sugerido debe quedar siempre por
 * debajo de esa duración: redondear hacia arriba producía un valor mayor al
 * bloque y «Ajustar a X h» volvía a fallar en bucle (caso O-1126_09).
 * Truncar a minutos completos pierde menos de un minuto y da un texto claro.
 */
export function horasBloquePausa(sesion: {
  fechaInicio: string;
  fechaFin: string | null;
}): number | null {
  if (!sesion.fechaFin) return null;
  const inicio = new Date(sesion.fechaInicio).getTime();
  const fin = new Date(sesion.fechaFin).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return null;
  return Math.floor((fin - inicio) / 60_000) / 60;
}

/** Duración corta y en lenguaje del piso: `4 min`, `1.5 h`, `menos de 1 min`. */
export function duracionLegible(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 0) return 'menos de 1 min';
  const minutos = Math.round(horas * 60);
  if (minutos < 60) return `${minutos} min`;
  return horasLegibles(minutos / 60);
}

export function turnoLegible(turno: string): string {
  return TURNOS[turno] ?? turno;
}

export function tamanoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Texto de compromiso relativo a hoy: `vence hoy`, `en 3 días`, `vencida 2 días`. */
export function textoCompromiso(fechaCompromiso: string, hoy: string): string {
  const dias = Math.round(
    (fechaDia(fechaCompromiso).getTime() - fechaDia(hoy).getTime()) / 86_400_000,
  );
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 1) return `en ${dias} días`;
  if (dias === -1) return 'vencida ayer';
  return `vencida hace ${Math.abs(dias)} días`;
}
