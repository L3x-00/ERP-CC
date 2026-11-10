import {
  pasoCapacidadInstalada,
  type PasoGuiaCapacidad,
} from '@/modulos/planeacion/utilidades/diagnostico-capacidad';
import type {
  DisponibilidadGrupo,
  ResumenDisponibilidadPropuesta,
} from '@/modulos/propuestas/tipos/disponibilidad';

const HREF_TARIFAS = '/configuracion?pestana=tarifas';

function listar(nombres: readonly string[], formato: (nombre: string) => string): string {
  if (nombres.length <= 2) return nombres.map(formato).join(' y ');
  return `${nombres.slice(0, 2).map(formato).join(', ')} y ${nombres.length - 2} más`;
}

function pasoProcesosSinGrupo(grupos: ResumenDisponibilidadPropuesta['procesosSinGrupo']): PasoGuiaCapacidad {
  const nombres = grupos.map((proceso) => proceso.nombre);
  const horas = grupos.reduce((total, proceso) => total + proceso.horasRequeridas, 0);
  return {
    clave: 'procesos-sin-grupo',
    titulo:
      nombres.length === 1
        ? `El proceso «${nombres[0]}» no tiene grupo de equipo`
        : `${nombres.length} procesos no tienen grupo de equipo`,
    detalle: `${listar(nombres, (nombre) => `«${nombre}»`)} ${
      nombres.length === 1 ? 'suma' : 'suman'
    } ${horas} h de ruteo que hoy no se comparan con ninguna capacidad. Asígnale un grupo de equipo al proceso en Configuración → Tarifas y costos.`,
    href: HREF_TARIFAS,
    etiqueta: 'Abrir Tarifas y costos',
  };
}

function pasoItemsSinRuteo(codigos: readonly string[]): PasoGuiaCapacidad {
  return {
    clave: 'items-sin-ruteo',
    titulo:
      codigos.length === 1
        ? `El ítem ${codigos[0]} no tiene ruteo`
        : `Los ítems ${codigos.join(', ')} no tienen ruteo`,
    detalle:
      'Sin operaciones y tiempos no hay horas que comparar. Agrega el ruteo del ítem en la propuesta y vuelve a consultar la disponibilidad.',
  };
}

function pasoGrupo(grupo: DisponibilidadGrupo): PasoGuiaCapacidad {
  if (grupo.recursosActivos === 0) {
    return {
      clave: `grupo-sin-equipos-${grupo.codigo}`,
      titulo: `El grupo «${grupo.nombre}» no tiene equipos activos`,
      detalle:
        'Ningún equipo activo pertenece a ese grupo, así que no hay capacidad que sumar. Revisa en Configuración → Tarifas y costos qué máquinas están activas y a qué grupo pertenecen.',
      href: HREF_TARIFAS,
      etiqueta: 'Abrir Tarifas y costos',
    };
  }

  if (grupo.recursosSinTurno >= grupo.recursosActivos) {
    return pasoCapacidadInstalada(
      `grupo-sin-turnos-${grupo.codigo}`,
      grupo.recursosActivos === 1
        ? `El equipo del grupo «${grupo.nombre}» no tiene turnos`
        : `Los ${grupo.recursosActivos} equipos del grupo «${grupo.nombre}» no tienen turnos`,
      'Sin turnos no hay horas de capacidad. Abre Capacidad instalada y guarda equipos y jornada: se registra el turno matutino base de 8 h por equipo. Si trabajan en otro turno, un administrador debe registrarlo con sus horas.',
    );
  }

  return pasoCapacidadInstalada(
    `grupo-turnos-incompletos-${grupo.codigo}`,
    `${grupo.recursosSinTurno} de ${grupo.recursosActivos} equipos de «${grupo.nombre}» no tienen turnos`,
    'Sus horas no se suman al total y el resumen queda incompleto. Guarda su capacidad en Capacidad instalada para crear el turno base y recupera esas horas.',
  );
}

/**
 * Traduce el resumen de disponibilidad a los pendientes reales. `grupoCodigo`
 * limita el diagnóstico al grupo que abrió la guía; sin él se revisan todos los
 * grupos sin capacidad configurada. Devuelve vacío cuando no hay un pendiente
 * demostrable y la pantalla debe usar la guía general.
 */
export function diagnosticarCapacidadDisponibilidad(
  resumen: ResumenDisponibilidadPropuesta,
  grupoCodigo: string | null = null,
): PasoGuiaCapacidad[] {
  const pasos: PasoGuiaCapacidad[] = [];

  if (resumen.procesosSinGrupo.length > 0) {
    pasos.push(pasoProcesosSinGrupo(resumen.procesosSinGrupo));
  }
  if (resumen.itemsSinRuteo.length > 0) {
    pasos.push(pasoItemsSinRuteo(resumen.itemsSinRuteo));
  }

  const grupos = grupoCodigo
    ? resumen.grupos.filter((grupo) => grupo.codigo === grupoCodigo)
    : resumen.grupos.filter((grupo) => grupo.estado === 'sin_capacidad_configurada');
  for (const grupo of grupos) pasos.push(pasoGrupo(grupo));

  return pasos;
}
