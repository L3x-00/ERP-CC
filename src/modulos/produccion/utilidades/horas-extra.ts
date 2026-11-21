/**
 * Regla D2-A/C18/C20: al cerrar, se suman las horas netas de TODAS las sesiones
 * del operador en el día laboral de Tijuana (8 h corridas, comida descontada). Si el total
 * supera la jornada, la RPC exige autorización. Reanudar el mismo día no reinicia
 * el contador. El aviso es informativo: la base decide y consume la autorización.
 */
import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';
import { fechaHoraLocalTallerAIso } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

export const HORAS_JORNADA_PREDETERMINADA = 8;

/** Horas transcurridas desde el inicio de la sesión, nunca negativas. */
export function horasTranscurridasSesion(fechaInicio: string, ahora: Date): number {
  const inicio = new Date(fechaInicio).getTime();
  if (!Number.isFinite(inicio)) return 0;
  return Math.max(0, (ahora.getTime() - inicio) / 3_600_000);
}

/**
 * C27: valor para un campo `datetime-local` con la hora local del dispositivo
 * (AAAA-MM-DDTHH:mm). Prellena la hora real de conclusión sin inventar un
 * instante distinto al reloj del taller.
 */
export function ahoraLocalDatetimeInput(ahora: Date = new Date()): string {
  const dos = (valor: number): string => String(valor).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`
    + `T${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;
}

/**
 * C31/A13: el operador solo teclea la hora. La fecha se deriva del día de
 * negocio (Tijuana) para no pedir día/mes que él no necesita decidir.
 */
export function ahoraHoraInput(ahora: Date = new Date()): string {
  const dos = (valor: number): string => String(valor).padStart(2, '0');
  return `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;
}

/**
 * C31/A20: la hora del campo se interpreta en America/Tijuana, así que el valor
 * precargado debe venir de esa zona y no del reloj del dispositivo.
 */
export function ahoraHoraInputNegocio(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Tijuana',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const hora = partes.find((parte) => parte.type === 'hour')?.value ?? '00';
  const minuto = partes.find((parte) => parte.type === 'minute')?.value ?? '00';
  return `${hora}:${minuto}`;
}

/**
 * C31/A20: misma tolerancia de dos minutos que `registrar_hora_fin_sesion`.
 * Se comprueba antes de la RPC para no rechazar un cierre por una hora que el
 * navegador veía correcta pero que, en hora del taller, cae en el futuro.
 */
export function horaFinEsFutura(
  hora: string,
  fechaNegocio: string,
  ahora: Date = new Date(),
): boolean {
  if (!/^\d{2}:\d{2}$/u.test(hora)) return false;
  const marca = fechaHoraLocalTallerAIso(`${fechaNegocio.slice(0, 10)}T${hora.slice(0, 5)}`);
  return new Date(marca).getTime() > ahora.getTime() + 120_000;
}

/** Compone `AAAA-MM-DDTHH:mm` con la fecha de negocio de la sesión. */
export function fechaHoraNegocioDesdeHora(
  hora: string,
  fecha: string = fechaLocalNegocio(),
): string {
  return `${fecha.slice(0, 10)}T${hora.slice(0, 5)}`;
}

/**
 * `true` cuando la sesión ya alcanzó la jornada y probablemente el cierre pida
 * autorización. No garantiza el bloqueo: las pausas reducen las horas netas.
 */
export function sesionCercaDeJornada(
  fechaInicio: string,
  ahora: Date,
  jornada: number = HORAS_JORNADA_PREDETERMINADA,
): boolean {
  return horasTranscurridasSesion(fechaInicio, ahora) >= jornada;
}

/** Texto accionable que explica qué hacer si el cierre pide horas extra. */
export const AYUDA_HORAS_EXTRA =
  'La jornada es corrida de 8 horas (la comida de 12 a 1 no se cuenta). Si el tiempo neto acumulado del día supera esas 8 horas, el cierre te pedirá justificar el exceso o pedir aprobación en Producción → Horas extra. Reanudar el mismo día no reinicia el contador; la sesión también se pausa sola al cumplir la jornada.';
