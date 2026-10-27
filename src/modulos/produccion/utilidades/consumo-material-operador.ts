import type { RegistroConsumoMaterial } from '@/modulos/ordenes/tipos/ordenes';

/** Datos de consumo que pueden enviarse al piso sin revelar costos históricos. */
export interface ConsumoMaterialVisible {
  id: string;
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  creadoEn: string;
}

export interface ResumenConsumoMaterial {
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  cantidadTotal: number;
  registros: number;
}

/** El servidor elimina el costo antes de serializar consumos hacia el cliente. */
export function consumoMaterialVisibleDesdeRegistro(
  consumo: RegistroConsumoMaterial,
): ConsumoMaterialVisible {
  return {
    id: consumo.id,
    partidaId: consumo.partidaId,
    materialId: consumo.materialId,
    cantidadUsada: consumo.cantidadUsada,
    cantidadScrap: consumo.cantidadScrap,
    creadoEn: consumo.creadoEn,
  };
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
  consumos: readonly ConsumoMaterialVisible[],
): ResumenConsumoMaterial[] {
  const registrosVistos = new Set<string>();
  const agrupados = new Map<string, ResumenConsumoMaterial>();

  for (const consumo of consumos) {
    if (registrosVistos.has(consumo.id)) continue;
    registrosVistos.add(consumo.id);

    if (
      !consumo.partidaId
      || !consumo.materialId
      || !Number.isFinite(consumo.cantidadUsada)
      || !Number.isFinite(consumo.cantidadScrap)
      || consumo.cantidadUsada < 0
      || consumo.cantidadScrap < 0
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
    actual.cantidadTotal += consumo.cantidadUsada + consumo.cantidadScrap;
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
