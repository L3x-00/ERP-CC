import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';

/**
 * Cliente 2026-11-10: la guía de capacidad deja de ser un texto general. Cada
 * pantalla que ya conoce el dato (grupo sin equipos, equipo sin capacidad)
 * arma aquí los pasos concretos y la guía solo pinta lo que falta. Lo ya
 * configurado no se repite.
 */
export interface PasoGuiaCapacidad {
  clave: string;
  titulo: string;
  detalle: string;
  href?: string;
  etiqueta?: string;
}

export const HREF_CAPACIDAD_INSTALADA = '/planeacion#capacidad-instalada';

/**
 * Pasos de respaldo cuando la pantalla no puede determinar la causa exacta.
 * Nunca se muestran junto a un diagnóstico concreto.
 */
export const PASOS_GENERALES_CAPACIDAD: readonly PasoGuiaCapacidad[] = [
  {
    clave: 'grupo-del-proceso',
    titulo: 'Revisa el grupo del proceso',
    detalle:
      'En Configuración → Tarifas y costos, confirma que el proceso tenga asignado un grupo de equipo y que ese grupo tenga equipos activos.',
    href: '/configuracion?pestana=tarifas',
    etiqueta: 'Abrir Tarifas y costos',
  },
  {
    clave: 'equipos-y-jornada',
    titulo: 'Revisa equipos y jornada',
    detalle:
      'En Planeación → Capacidad instalada, confirma cuántos equipos tiene cada recurso y, si aplica, su jornada por equipo (máximo 8 h de lunes a viernes). No hay que registrar turnos: matutino y vespertino son solo etiquetas visuales.',
    href: HREF_CAPACIDAD_INSTALADA,
    etiqueta: 'Abrir Capacidad instalada',
  },
  {
    clave: 'jornada-del-equipo',
    titulo: 'Revisa la fecha y la jornada',
    detalle:
      'La jornada es continua: lunes a viernes 8 h, sábado 4 h y domingo cerrado. Si la fecha cae en domingo o el equipo tiene una excepción de capacidad, no habrá horas disponibles ese día.',
  },
];

export function pasoCapacidadInstalada(
  clave: string,
  titulo: string,
  detalle: string,
): PasoGuiaCapacidad {
  return {
    clave,
    titulo,
    detalle,
    href: HREF_CAPACIDAD_INSTALADA,
    etiqueta: 'Abrir Capacidad instalada',
  };
}

export interface EntradaDiagnosticoTurno {
  recurso: { id: string; codigo: string; nombre: string } | null;
  fecha: string;
  /** Filas de carga del rango visible; se filtran por recurso y fecha. */
  cargas: readonly CargaCapacidadDiaria[];
}

/**
 * Diagnóstico de un alta o reprogramación sobre una fecha concreta. C24: el
 * turno es solo una etiqueta, así que lo único que se puede afirmar es si el
 * equipo tiene o no capacidad ese día (domingo cerrado, excepción en cero o
 * jornada configurada). Si no hay filas para la fecha, no se inventa un paso.
 */
export function diagnosticarCapacidadTurno({
  recurso,
  fecha,
  cargas,
}: EntradaDiagnosticoTurno): PasoGuiaCapacidad[] {
  if (!recurso) return [];
  const propias = cargas.filter(
    (carga) => carga.recursoId === recurso.id && carga.fechaProgramada === fecha,
  );
  if (propias.length === 0) return [];
  if (propias.some((carga) => horasCapacidadDe(carga) > 0)) return [];

  return [
    pasoCapacidadInstalada(
      'equipo-sin-capacidad-dia',
      `El equipo ${recurso.codigo} no tiene capacidad el ${fecha}`,
      'Ese día está cerrado (domingo) o el equipo tiene una excepción de capacidad en cero. Elige un día laboral o revisa la capacidad instalada del equipo.',
    ),
  ];
}

function horasCapacidadDe(carga: CargaCapacidadDiaria): number {
  const valor = Number(carga.horasCapacidad);
  return Number.isFinite(valor) ? valor : 0;
}
