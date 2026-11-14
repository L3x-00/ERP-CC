import type {
  GrupoOrdenEspacioOperador,
  ProcesoEspacioOperador,
} from '@/modulos/produccion/tipos/espacio-operador';
import { agruparProcesosPorOrden } from '@/modulos/produccion/tipos/espacio-operador';

export type EstadoMiProceso =
  | 'en_proceso'
  | 'pausado'
  | 'pendiente'
  | 'terminado';

export interface MiProceso {
  proceso: ProcesoEspacioOperador;
  estado: EstadoMiProceso;
  horasTrabajadas: number;
  piezasRegistradas: number;
}

export interface ResumenMiPanel {
  reclamados: number;
  enProceso: number;
  pendientes: number;
  pausados: number;
  terminados: number;
  horasReservadas: number;
  horasTrabajadas: number;
}

export function obtenerMisProcesos(
  procesos: readonly ProcesoEspacioOperador[],
  operadorId: string,
): MiProceso[] {
  const sesionesDe = (proceso: ProcesoEspacioOperador) => proceso.sesiones.filter(
    (sesion) => sesion.operadorId === operadorId,
  );
  const esReclamadoPorMi = (proceso: ProcesoEspacioOperador) =>
    proceso.reclamo?.operadorId === operadorId && proceso.reclamo.estado === 'activo';

  const propias = new Set<string>();
  const partidasPropias = new Set<string>();
  for (const proceso of procesos) {
    if (esReclamadoPorMi(proceso) || sesionesDe(proceso).length > 0) {
      propias.add(proceso.id);
      partidasPropias.add(proceso.partidaId);
    }
  }

  // El proceso siguiente de una partida que ya trabajé aparece para reclamarlo
  // en cuanto el proceso anterior libera piezas.
  const disponibles = procesos.filter((proceso) => (
    !propias.has(proceso.id)
    && partidasPropias.has(proceso.partidaId)
    && proceso.reclamo === null
    && proceso.columna !== 'lista'
    && sesionesDe(proceso).length === 0
    && (proceso.piezasDisponibles === null || proceso.piezasDisponibles > 0)
  ));

  return [...procesos.filter((proceso) => propias.has(proceso.id)), ...disponibles]
    .map((proceso): MiProceso => {
      const sesiones = sesionesDe(proceso);

      const sesionActiva = sesiones.some(
        (sesion) => sesion.estadoSesion === 'activa',
      );

      const ultimaSesion = [...sesiones].sort(
        (a, b) => b.fechaInicio.localeCompare(a.fechaInicio),
      )[0];

      let estado: EstadoMiProceso;

      if (sesionActiva) {
        estado = 'en_proceso';
      } else if (ultimaSesion?.estadoSesion === 'pausada') {
        estado = 'pausado';
      } else if (
        proceso.columna === 'lista' &&
        sesiones.some((sesion) => sesion.estadoSesion === 'finalizada')
      ) {
        estado = 'terminado';
      } else {
        estado = 'pendiente';
      }

      return {
        proceso,
        estado,
        horasTrabajadas: Math.round(
          sesiones.reduce(
            (total, sesion) => total + sesion.horasNetas,
            0,
          ) * 100,
        ) / 100,
        piezasRegistradas: sesiones.reduce(
          (total, sesion) => total + sesion.piezasProducidas,
          0,
        ),
      };
    });
}

/** Orden de «Mis procesos» con los procesos del operador que la componen. */
export interface OrdenMisProcesos {
  grupo: GrupoOrdenEspacioOperador;
  procesos: MiProceso[];
}

/**
 * Punto 10: agrupa los procesos personales por orden. La tarjeta deja de
 * repetirse por operación: una orden con varias partidas o procesos conserva
 * una sola identidad y muestra dentro sus procesos con su propio estado.
 */
export function agruparMisProcesosPorOrden(
  misProcesos: readonly MiProceso[],
): OrdenMisProcesos[] {
  const porProcesoId = new Map(misProcesos.map((item) => [item.proceso.id, item]));
  return agruparProcesosPorOrden(misProcesos.map((item) => item.proceso))
    .map((grupo) => ({
      grupo,
      procesos: grupo.procesos
        .map((proceso) => porProcesoId.get(proceso.id))
        .filter((item): item is MiProceso => item !== undefined),
    }))
    .filter(({ procesos }) => procesos.length > 0);
}

export function resumirMiPanel(
  misProcesos: readonly MiProceso[],
  operadorId: string,
): ResumenMiPanel {
  return {
    reclamados: misProcesos.filter(
      ({ proceso }) =>
        proceso.reclamo?.operadorId === operadorId &&
        proceso.reclamo.estado === 'activo',
    ).length,
    enProceso: misProcesos.filter(
      (item) => item.estado === 'en_proceso',
    ).length,
    pendientes: misProcesos.filter(
      (item) => item.estado === 'pendiente',
    ).length,
    pausados: misProcesos.filter(
      (item) => item.estado === 'pausado',
    ).length,
    terminados: misProcesos.filter(
      (item) => item.estado === 'terminado',
    ).length,
    horasReservadas: Math.round(
      misProcesos.reduce(
        (total, { proceso }) =>
          total + (
            proceso.reclamo?.operadorId === operadorId &&
            proceso.reclamo.estado === 'activo'
              ? proceso.reclamo.horasEstimadas
              : 0
          ),
        0,
      ) * 100,
    ) / 100,
    horasTrabajadas: Math.round(
      misProcesos.reduce(
        (total, item) => total + item.horasTrabajadas,
        0,
      ) * 100,
    ) / 100,
  };
}

// Reutiliza sesiones y sus horas netas ya consolidadas por PostgreSQL.
// La jornada usa el calendario del taller, NO el reloj local del navegador.
const formateadorDiaTaller = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Tijuana',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function diaTaller(fechaIso: string): string | null {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return null;
  const partes = formateadorDiaTaller.formatToParts(fecha);
  const valor = (tipo: 'year' | 'month' | 'day') =>
    partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export interface ResumenJornadaDiaria {
  horasConsolidadas: number;
  sesionesActivas: number;
  sesionesEntreDias: number;
}

/**
 * Horas cerradas íntegramente en la fecha operativa; evita duplicar sesiones.
 * Las sesiones que cruzan medianoche se separan hasta disponer del reparto
 * exacto por jornada. No altera ni recalcula las horas netas de PostgreSQL.
 */
export function resumirJornadaDiaria(
  procesos: readonly ProcesoEspacioOperador[],
  operadorId: string,
  hoy: string,
): ResumenJornadaDiaria {
  const vistas = new Set<string>();
  let horasConsolidadas = 0;
  let sesionesActivas = 0;
  let sesionesEntreDias = 0;

  for (const proceso of procesos) {
    for (const sesion of proceso.sesiones) {
      if (sesion.operadorId !== operadorId || vistas.has(sesion.id)) continue;
      vistas.add(sesion.id);

      const inicio = diaTaller(sesion.fechaInicio);
      const fin = sesion.fechaFin ? diaTaller(sesion.fechaFin) : null;

      if (sesion.estadoSesion === 'activa') {
        if (inicio === hoy) sesionesActivas += 1;
        continue;
      }
      if (!inicio || !fin || (inicio !== hoy && fin !== hoy)) continue;
      if (inicio !== fin) {
        sesionesEntreDias += 1;
        continue;
      }
      if (Number.isFinite(sesion.horasNetas) && sesion.horasNetas >= 0) {
        horasConsolidadas += sesion.horasNetas;
      }
    }
  }

  return {
    horasConsolidadas: Math.round(horasConsolidadas * 100) / 100,
    sesionesActivas,
    sesionesEntreDias,
  };
}
