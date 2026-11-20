import { fechaLocalNegocio } from '@/compartido/utilidades/fecha-negocio';
import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import type {
  ProcesoEspacioOperador,
  SesionProceso,
} from '@/modulos/produccion/tipos/espacio-operador';

/**
 * Estado de un equipo en la carga por área. Se deriva del mismo espacio del
 * operador que pinta el Kanban: no agrega consultas ni inventa un estado que
 * PostgreSQL no haya registrado.
 */
export interface EquipoEnUso {
  recursoId: string;
  recursoCodigo: string;
  recursoNombre: string;
  proceso: ProcesoEspacioOperador;
}

export function equiposEnUso(
  procesos: readonly ProcesoEspacioOperador[],
): EquipoEnUso[] {
  const equipos: EquipoEnUso[] = [];
  for (const proceso of procesos) {
    const sesion = proceso.sesionActiva;
    const programacion = proceso.programacion;
    if (!sesion || !programacion) continue;
    equipos.push({
      recursoId: programacion.recursoId,
      recursoCodigo: programacion.recursoCodigo ?? 'Equipo',
      recursoNombre: programacion.recursoNombre ?? 'Sin nombre',
      proceso,
    });
  }
  return equipos.sort((primero, segundo) => (
    primero.recursoCodigo.localeCompare(segundo.recursoCodigo, 'es')
    || primero.proceso.folioOrden.localeCompare(segundo.proceso.folioOrden, 'es')
  ));
}

/** Sesión cerrada de un equipo junto con el proceso al que pertenece. */
export interface SesionTrabajadaArea {
  sesion: SesionProceso;
  proceso: ProcesoEspacioOperador;
}

export interface DetalleAreaCarga {
  /** Proceso que ocupa el equipo en este momento, si hay una sesión en marcha. */
  procesoActual: ProcesoEspacioOperador | null;
  /** Sesiones ya cerradas en el día consultado, de la más reciente a la más antigua. */
  sesionesCerradas: SesionTrabajadaArea[];
  horasTrabajadas: number;
  piezasProducidas: number;
}

const DETALLE_VACIO: DetalleAreaCarga = {
  procesoActual: null,
  sesionesCerradas: [],
  horasTrabajadas: 0,
  piezasProducidas: 0,
};

/**
 * Detalle de un equipo para el diálogo de la carga: qué proceso lo ocupa ahora
 * y qué se trabajó en él durante el día de negocio indicado.
 */
export function resumirAreaCarga(
  procesos: readonly ProcesoEspacioOperador[],
  recursoId: string,
  fecha: string,
  hoy: string,
): DetalleAreaCarga {
  const delRecurso = procesos.filter(
    (proceso) => proceso.programacion?.recursoId === recursoId,
  );
  if (delRecurso.length === 0) return DETALLE_VACIO;

  // C31/A7: «Ocupado ahora» solo vale para el día de negocio actual. Consultar
  // un día pasado no debe reetiquetar una sesión antigua como ocupación vigente.
  const procesoActual = fecha === hoy
    ? delRecurso.find((proceso) => (
      proceso.sesionActiva !== null
      && fechaLocalNegocio(new Date(proceso.sesionActiva.fechaInicio)) === hoy
    )) ?? null
    : null;

  const vistas = new Set<string>();
  const sesionesCerradas: SesionTrabajadaArea[] = [];
  for (const proceso of delRecurso) {
    for (const sesion of proceso.sesiones ?? []) {
      // C31/A7: una pausa no es una sesión cerrada del día.
      if (sesion.estadoSesion !== 'finalizada' || vistas.has(sesion.id)) continue;
      if (fechaLocalNegocio(new Date(sesion.fechaInicio)) !== fecha) continue;
      vistas.add(sesion.id);
      sesionesCerradas.push({ sesion, proceso });
    }
  }
  sesionesCerradas.sort((primero, segundo) => (
    segundo.sesion.fechaInicio.localeCompare(primero.sesion.fechaInicio)
  ));

  return {
    procesoActual,
    sesionesCerradas,
    horasTrabajadas: redondearHoras(
      sesionesCerradas.reduce((total, { sesion }) => total + sesion.horasNetas, 0),
    ),
    piezasProducidas: sesionesCerradas.reduce(
      (total, { sesion }) => total + sesion.piezasProducidas,
      0,
    ),
  };
}

/** Capacidad, pendiente, trabajo y saldo de un equipo en un día concreto. */
export interface CapacidadDiaArea {
  capacidad: number;
  pendientes: number;
  trabajadas: number;
  libres: number;
}

/**
 * Mismo criterio que la matriz de carga: el saldo libre descuenta lo pendiente
 * y lo ya trabajado, sin contar la sesión en marcha hasta que se cierre.
 */
export function capacidadDiaArea(
  cargas: readonly CargaCapacidadDiaria[],
  recursoId: string,
  fecha: string,
): CapacidadDiaArea {
  const delDia = cargas.filter(
    (carga) => carga.recursoId === recursoId && carga.fechaProgramada === fecha,
  );
  return {
    capacidad: redondearHoras(delDia.reduce((total, carga) => total + carga.horasCapacidad, 0)),
    pendientes: redondearHoras(delDia.reduce((total, carga) => total + carga.horasProgramadas, 0)),
    trabajadas: redondearHoras(delDia.reduce((total, carga) => total + carga.horasReales, 0)),
    libres: redondearHoras(delDia.reduce(
      (total, carga) => total
        + Math.max(0, carga.horasCapacidad - carga.horasProgramadas - carga.horasReales),
      0,
    )),
  };
}

function redondearHoras(valor: number): number {
  return Math.round(valor * 100) / 100;
}
