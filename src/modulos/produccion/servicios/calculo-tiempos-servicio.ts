export const ZONA_HORARIA_TALLER = 'America/Tijuana';

export interface CalculoHorasSesion {
  horasBrutas: number;
  horasComida: number;
  horasNetas: number;
}

type PartesFecha = {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

const formateadorTaller = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA_TALLER,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function redondearHoras(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function obtenerPartesFecha(fecha: Date): PartesFecha {
  const partes = formateadorTaller.formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((actual) => actual.type === tipo)?.value;
    if (!parte) throw new Error('No se pudo interpretar la hora local del taller');
    return Number(parte);
  };

  return {
    anio: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  };
}

/** Representa el reloj local como UTC artificial para medir intervalos de calendario. */
function fechaMuralTaller(fecha: Date): Date {
  const partes = obtenerPartesFecha(fecha);
  return new Date(Date.UTC(
    partes.anio,
    partes.mes - 1,
    partes.dia,
    partes.hora,
    partes.minuto,
    partes.segundo,
  ));
}

function solapamientoMilisegundos(inicio: Date, fin: Date, inicioRango: Date, finRango: Date): number {
  return Math.max(0, Math.min(fin.getTime(), finRango.getTime()) - Math.max(inicio.getTime(), inicioRango.getTime()));
}

/**
 * Calcula el traslape de comida usando los días de calendario de Tijuana. Se
 * mide solo el intervalo local [12:00, 13:00), incluso si cambia el horario de
 * verano entre dos sesiones.
 */
export function calcularHorasComida(inicio: Date, fin: Date): number {
  const inicioMural = fechaMuralTaller(inicio);
  const finMural = fechaMuralTaller(fin);
  const cursor = new Date(Date.UTC(
    inicioMural.getUTCFullYear(),
    inicioMural.getUTCMonth(),
    inicioMural.getUTCDate(),
  ));
  const ultimoDia = new Date(Date.UTC(
    finMural.getUTCFullYear(),
    finMural.getUTCMonth(),
    finMural.getUTCDate(),
  ));
  let milisegundosComida = 0;

  while (cursor.getTime() <= ultimoDia.getTime()) {
    const inicioComida = new Date(cursor);
    inicioComida.setUTCHours(12, 0, 0, 0);
    const finComida = new Date(cursor);
    finComida.setUTCHours(13, 0, 0, 0);
    milisegundosComida += solapamientoMilisegundos(
      inicioMural,
      finMural,
      inicioComida,
      finComida,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return redondearHoras(milisegundosComida / 3_600_000);
}

/** Cálculo determinista para previsualización y pruebas; PostgreSQL lo recalcula al cerrar. */
export function calcularHorasSesion(inicio: Date, fin: Date): CalculoHorasSesion {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || fin < inicio) {
    throw new Error('El rango de sesión no es válido');
  }

  const horasBrutas = redondearHoras((fin.getTime() - inicio.getTime()) / 3_600_000);
  const horasComida = calcularHorasComida(inicio, fin);
  return {
    horasBrutas,
    horasComida,
    horasNetas: redondearHoras(Math.max(horasBrutas - horasComida, 0)),
  };
}
