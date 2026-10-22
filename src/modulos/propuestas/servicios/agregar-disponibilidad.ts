import type { CargaCapacidadDiaria } from '@/modulos/planeacion/tipos/indice';
import { ZONA_HORARIA_TALLER } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';
import type {
  DisponibilidadGrupo,
  ProcesoSinGrupo,
  ResumenDisponibilidadPropuesta,
} from '@/modulos/propuestas/tipos/disponibilidad';
import { resolverGrupoEquipoDelProceso } from '@/modulos/propuestas/utilidades/ruteo-proceso';

export const DIAS_HORIZONTE_DISPONIBILIDAD = 14;

export type HorizonteDisponibilidad = {
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  zonaHoraria: string;
};

export type ItemDisponibilidad = {
  id: string;
  codigo: string;
  activo: boolean;
  esDescuento: boolean;
};

export type RenglonRuteoDisponibilidad = {
  id: string;
  itemId: string;
  procesoId: string;
  grupoEquipoId: string | null;
  setupHoras: number;
  runHoras: number;
  totalHoras: number | null;
};

export type ProcesoCatalogoDisponibilidad = {
  id: string;
  codigo: string;
  nombre: string;
  grupoEquipoId: string | null;
};

export type GrupoCatalogoDisponibilidad = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
};

export type RecursoCapacidadDisponibilidad = { id: string; grupoEquipoId: string | null };

export type EntradaAgregacionDisponibilidad = {
  revisionId: string;
  horizonte: HorizonteDisponibilidad;
  items: readonly ItemDisponibilidad[];
  ruteo: readonly RenglonRuteoDisponibilidad[];
  procesos: readonly ProcesoCatalogoDisponibilidad[];
  grupos: readonly GrupoCatalogoDisponibilidad[];
  recursos: readonly RecursoCapacidadDisponibilidad[];
  cargas: readonly CargaCapacidadDiaria[];
};

const PROCESO_SIN_CATALOGO = 'Proceso no identificado en el catálogo';

/** Fecha `YYYY-MM-DD` de la planta, sin depender de la zona del servidor. */
export function fechaLocalPlanta(ahora: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_TALLER,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}

function sumarDias(fecha: string, dias: number): string {
  const instante = new Date(`${fecha}T00:00:00.000Z`);
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

/** Horizonte fijo de días calendario (no hábiles) desde hoy en la planta. */
export function horizonteDisponibilidad(ahora: Date): HorizonteDisponibilidad {
  const fechaInicio = fechaLocalPlanta(ahora);
  return {
    fechaInicio,
    fechaFin: sumarDias(fechaInicio, DIAS_HORIZONTE_DISPONIBILIDAD - 1),
    dias: DIAS_HORIZONTE_DISPONIBILIDAD,
    zonaHoraria: ZONA_HORARIA_TALLER,
  };
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function horasSeguras(valor: number): number {
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function unicosPorId<T extends { id: string }>(filas: readonly T[]): T[] {
  const vistos = new Map<string, T>();
  for (const fila of filas) if (!vistos.has(fila.id)) vistos.set(fila.id, fila);
  return [...vistos.values()];
}

/**
 * Grupo del catálogo vigente para un proceso, solo si la correspondencia es
 * inequívoca: el grupo configurado activo, o un único grupo que coincide por
 * nombre/código según la utilidad del ruteo. Nunca adivina.
 */
function resolverGrupoInequivoco(
  proceso: ProcesoCatalogoDisponibilidad | undefined,
  gruposActivos: readonly GrupoCatalogoDisponibilidad[],
): string | null {
  if (!proceso) return null;
  if (proceso.grupoEquipoId && gruposActivos.some((grupo) => grupo.id === proceso.grupoEquipoId)) {
    return proceso.grupoEquipoId;
  }
  const encontrado = resolverGrupoEquipoDelProceso(proceso, gruposActivos);
  if (!encontrado) return null;
  const otro = resolverGrupoEquipoDelProceso(
    { ...proceso, grupoEquipoId: null },
    gruposActivos.filter((grupo) => grupo.id !== encontrado),
  );
  return otro ? null : encontrado;
}

type DatosRuteo = Pick<EntradaAgregacionDisponibilidad, 'items' | 'ruteo' | 'procesos' | 'grupos'>;

type RenglonResuelto = {
  renglon: RenglonRuteoDisponibilidad;
  horas: number;
  proceso: ProcesoCatalogoDisponibilidad | undefined;
  grupoId: string | null;
};

/**
 * Renglones de ítems activos no descuento, sin duplicados, con sus horas y el
 * grupo persistido (o resuelto sin ambigüedad desde el catálogo del proceso).
 */
function resolverRenglones(datos: DatosRuteo): { items: ItemDisponibilidad[]; renglones: RenglonResuelto[] } {
  const items = unicosPorId(datos.items).filter((item) => item.activo && !item.esDescuento);
  const idsItems = new Set(items.map((item) => item.id));
  const grupoPorId = new Map(datos.grupos.map((grupo) => [grupo.id, grupo]));
  const gruposActivos = datos.grupos.filter((grupo) => grupo.activo);
  const procesoPorId = new Map(datos.procesos.map((proceso) => [proceso.id, proceso]));

  const renglones = unicosPorId(datos.ruteo)
    .filter((renglon) => idsItems.has(renglon.itemId))
    .map((renglon) => {
      const proceso = procesoPorId.get(renglon.procesoId);
      return {
        renglon,
        proceso,
        horas: horasSeguras(
          renglon.totalHoras ?? horasSeguras(renglon.setupHoras) + horasSeguras(renglon.runHoras),
        ),
        grupoId:
          renglon.grupoEquipoId && grupoPorId.has(renglon.grupoEquipoId)
            ? renglon.grupoEquipoId
            : resolverGrupoInequivoco(proceso, gruposActivos),
      };
    });
  return { items, renglones };
}

/** Grupos de equipo que requiere el ruteo: acota la lectura de recursos. */
export function idsGruposRequeridos(datos: DatosRuteo): string[] {
  const ids = resolverRenglones(datos).renglones.map((resuelto) => resuelto.grupoId);
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

function capacidadDelGrupo(
  grupoId: string,
  entrada: EntradaAgregacionDisponibilidad,
): Pick<DisponibilidadGrupo, 'estado' | 'horasCapacidad' | 'horasCarga' | 'horasDisponibles' | 'turnosSobrecargados' | 'recursosSinTurno'> {
  const recursos = new Set(
    entrada.recursos.filter((recurso) => recurso.grupoEquipoId === grupoId).map((recurso) => recurso.id),
  );
  const { fechaInicio, fechaFin } = entrada.horizonte;
  const turnos = new Map<string, CargaCapacidadDiaria>();
  for (const fila of entrada.cargas) {
    if (!recursos.has(fila.recursoId)) continue;
    if (fila.fechaProgramada < fechaInicio || fila.fechaProgramada > fechaFin) continue;
    const clave = `${fila.recursoId}|${fila.fechaProgramada}|${fila.turno}`;
    if (!turnos.has(clave)) turnos.set(clave, fila);
  }
  const recursosConTurno = new Set([...turnos.values()].map((fila) => fila.recursoId));
  const recursosSinTurno = [...recursos].filter((id) => !recursosConTurno.has(id)).length;

  if (turnos.size === 0) {
    return {
      estado: 'sin_capacidad_configurada',
      horasCapacidad: null,
      horasCarga: null,
      horasDisponibles: null,
      turnosSobrecargados: 0,
      recursosSinTurno,
    };
  }

  let capacidad = 0;
  let carga = 0;
  let disponible = 0;
  let sobrecargados = 0;
  for (const fila of turnos.values()) {
    capacidad += horasSeguras(fila.horasCapacidad);
    carga += horasSeguras(fila.horasProgramadas);
    // Un turno saturado no compensa lo libre de otro turno.
    disponible += horasSeguras(fila.horasDisponibles);
    if (fila.sobrecargado) sobrecargados += 1;
  }
  return {
    estado: 'con_capacidad',
    horasCapacidad: redondear(capacidad),
    horasCarga: redondear(carga),
    horasDisponibles: redondear(disponible),
    turnosSobrecargados: sobrecargados,
    recursosSinTurno,
  };
}

/**
 * Resumen informativo por grupo de equipo. Solo cuenta ítems activos no
 * descuento de la revisión; un ítem sin ruteo es información incompleta.
 */
export function agregarDisponibilidad(
  entrada: EntradaAgregacionDisponibilidad,
): ResumenDisponibilidadPropuesta {
  const { items, renglones } = resolverRenglones(entrada);
  const conRuteo = new Set(renglones.map(({ renglon }) => renglon.itemId));
  const grupoPorId = new Map(entrada.grupos.map((grupo) => [grupo.id, grupo]));

  const horasPorGrupo = new Map<string, number>();
  const sinGrupo = new Map<string, ProcesoSinGrupo>();
  for (const { horas, proceso, grupoId } of renglones) {
    if (grupoId) {
      horasPorGrupo.set(grupoId, (horasPorGrupo.get(grupoId) ?? 0) + horas);
      continue;
    }
    const clave = proceso ? proceso.id : PROCESO_SIN_CATALOGO;
    const previo = sinGrupo.get(clave);
    sinGrupo.set(clave, {
      nombre: proceso?.nombre ?? PROCESO_SIN_CATALOGO,
      horasRequeridas: (previo?.horasRequeridas ?? 0) + horas,
    });
  }

  const grupos: DisponibilidadGrupo[] = [...horasPorGrupo.entries()]
    .flatMap(([grupoId, horas]) => {
      const grupo = grupoPorId.get(grupoId);
      if (!grupo) return [];
      return {
        codigo: grupo.codigo,
        nombre: grupo.nombre,
        horasRequeridas: redondear(horas),
        ...capacidadDelGrupo(grupoId, entrada),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return {
    revisionId: entrada.revisionId,
    ...entrada.horizonte,
    grupos,
    procesosSinGrupo: [...sinGrupo.values()].map((proceso) => ({
      ...proceso,
      horasRequeridas: redondear(proceso.horasRequeridas),
    })),
    itemsSinRuteo: items.filter((item) => !conRuteo.has(item.id)).map((item) => item.codigo),
    sinItemsActivos: items.length === 0,
  };
}
