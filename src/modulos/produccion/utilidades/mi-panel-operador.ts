import type { ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';

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
  return procesos.flatMap((proceso) => {
    const sesiones = proceso.sesiones.filter(
      (sesion) => sesion.operadorId === operadorId,
    );

    const reclamadoPorMi =
      proceso.reclamo?.operadorId === operadorId &&
      proceso.reclamo.estado === 'activo';

    if (!reclamadoPorMi && sesiones.length === 0) {
      return [];
    }

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

    return [{
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
    }];
  });
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
import type { RegistroConsumoMaterial } from '@/modulos/ordenes/tipos/ordenes';

export interface ResumenConsumoMaterial {
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  cantidadTotal: number;
  registros: number;
}

/**
 * Agrupa el consumo real por partida y material.
 *
 * No mezcla materiales distintos ni atribuye consumos
 * de una partida a un proceso individual.
 *
 * Los registros se deduplican por su identificador.
 */
export function resumirConsumosMateriales(
  consumos: readonly RegistroConsumoMaterial[],
): ResumenConsumoMaterial[] {
  const registrosVistos = new Set<string>();
  const agrupados = new Map<string, ResumenConsumoMaterial>();

  for (const consumo of consumos) {
    if (registrosVistos.has(consumo.id)) continue;
    registrosVistos.add(consumo.id);

    if (
      !consumo.partidaId ||
      !consumo.materialId ||
      !Number.isFinite(consumo.cantidadUsada) ||
      !Number.isFinite(consumo.cantidadScrap) ||
      consumo.cantidadUsada < 0 ||
      consumo.cantidadScrap < 0
    ) {
      continue;
    }

    const clave = JSON.stringify([
      consumo.partidaId,
      consumo.materialId,
    ]);

    const actual = agrupados.get(clave) ?? {
      partidaId: consumo.partidaId,
      materialId: consumo.materialId,
      cantidadUsada: 0,
      cantidadScrap: 0,
      cantidadTotal: 0,
      registros: 0,
    };

    actual.cantidadUsada += consumo.cantidadUsada;
    actual.cantidadScrap += consumo.cantidadScrap;
    actual.cantidadTotal +=
      consumo.cantidadUsada + consumo.cantidadScrap;
    actual.registros += 1;

    agrupados.set(clave, actual);
  }

  return [...agrupados.values()].map((resumen) => ({
    ...resumen,
    cantidadUsada: Math.round(resumen.cantidadUsada * 1000) / 1000,
    cantidadScrap: Math.round(resumen.cantidadScrap * 1000) / 1000,
    cantidadTotal: Math.round(resumen.cantidadTotal * 1000) / 1000,
  }));
}
