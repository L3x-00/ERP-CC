import type {
  CargaCapacidadDiaria,
  TurnoPlaneacion,
} from '@/modulos/planeacion/tipos/indice';
import { ETIQUETA_TURNO } from '@/modulos/planeacion/utilidades/etiquetas';

/**
 * Cliente 2026-11-10: la guía de capacidad deja de ser un texto general. Cada
 * pantalla que ya conoce el dato (grupo sin equipos, equipo sin turnos, turno
 * sin capacidad) arma aquí los pasos concretos y la guía solo pinta lo que
 * falta. Lo ya configurado no se repite.
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
      'En Planeación → Capacidad instalada, confirma cuántos equipos tiene cada recurso y, si aplica, su jornada por equipo. Al guardar, si el equipo no tenía turnos se registra el turno matutino base de 8 h.',
    href: HREF_CAPACIDAD_INSTALADA,
    etiqueta: 'Abrir Capacidad instalada',
  },
  {
    clave: 'turnos-del-equipo',
    titulo: 'Revisa los turnos del equipo',
    detalle:
      'Si el equipo trabaja más de un turno (matutino, vespertino o nocturno), pide a un administrador que registre los turnos adicionales con sus horas. Un turno sin registrar no aparece en el calendario.',
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
  turno: TurnoPlaneacion;
  fecha: string;
  /** Filas de carga del rango visible; se filtran por recurso. */
  cargas: readonly CargaCapacidadDiaria[];
}

/**
 * Diagnóstico de un alta o reprogramación sobre un turno concreto. Solo afirma
 * lo que los datos prueban: si el equipo no tiene ninguna fila de capacidad, no
 * tiene turnos; si tiene filas pero no del turno elegido, le falta ese turno.
 * Cualquier otro caso se deja a la guía general.
 */
export function diagnosticarCapacidadTurno({
  recurso,
  turno,
  fecha,
  cargas,
}: EntradaDiagnosticoTurno): PasoGuiaCapacidad[] {
  if (!recurso) return [];
  const propias = cargas.filter((carga) => carga.recursoId === recurso.id);
  if (propias.length === 0) {
    return [
      pasoCapacidadInstalada(
        'equipo-sin-turnos',
        `El equipo ${recurso.codigo} no tiene turnos registrados`,
        'Sin turnos no hay horas que comparar. Abre Capacidad instalada y guarda equipos y jornada: se registra el turno matutino base de 8 h. Si el equipo trabaja en otro turno, un administrador debe registrarlo con sus horas.',
      ),
    ];
  }

  const turnos = [...new Set(propias.map((carga) => carga.turno))];
  if (!turnos.includes(turno)) {
    const existentes = turnos
      .map((configurado) => ETIQUETA_TURNO[configurado])
      .join(', ');
    return [
      pasoCapacidadInstalada(
        'equipo-sin-turno-elegido',
        `El equipo ${recurso.codigo} no tiene capacidad en el turno ${ETIQUETA_TURNO[turno]}`,
        `Solo tiene configurados: ${existentes}. Elige uno de esos turnos o pide que registren el turno ${ETIQUETA_TURNO[turno]} con sus horas para el ${fecha}.`,
      ),
    ];
  }

  return [];
}
