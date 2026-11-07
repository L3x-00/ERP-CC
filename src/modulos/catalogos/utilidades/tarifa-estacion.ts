import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';
import type { CatalogoTarifasCotizador } from '@/modulos/cotizador/tipos/indice';

/**
 * Estaciones de Configuración → Tarifas / TC a las que un Grupo de Equipo puede
 * vincular su tarifa por hora (obs. cliente 2026-10-13). Deben coincidir con el
 * CHECK de `grupos_equipo.estacion_tarifa` y con `public.tarifa_estacion_hora`.
 */
export const ESTACIONES_TARIFA = [
  'laser',
  'router',
  'doblado',
  'soldadura',
  'mano_obra',
  'acabado',
] as const;

export type EstacionTarifa = (typeof ESTACIONES_TARIFA)[number];

export const ETIQUETA_ESTACION_TARIFA: Record<EstacionTarifa, string> = {
  laser: 'Corte láser',
  router: 'Router CNC',
  doblado: 'Dobladora',
  soldadura: 'Soldadura',
  mano_obra: 'Mano de obra',
  acabado: 'Acabado',
};

export function esEstacionTarifa(valor: unknown): valor is EstacionTarifa {
  return typeof valor === 'string' && (ESTACIONES_TARIFA as readonly string[]).includes(valor);
}

/** Tarifa por hora (MXN) de una estación según el catálogo de Tarifas / TC. */
export function tarifaHoraDeEstacion(
  estacion: EstacionTarifa,
  catalogo: CatalogoTarifasCotizador = CATALOGO_TARIFAS_DEFECTO,
): number {
  switch (estacion) {
    case 'laser':
      return catalogo.laser.maquinaHora;
    case 'router':
      return catalogo.router.maquinaHora;
    case 'doblado':
      return catalogo.doblado.maquinaHora;
    case 'soldadura':
      return catalogo.fabricacion.soldaduraHora;
    case 'mano_obra':
      return catalogo.fabricacion.manoObraHora;
    case 'acabado':
      return catalogo.fabricacion.acabadoHora;
  }
}

/** Tarifa por hora de todas las estaciones, para mostrarla junto al vínculo. */
export function tarifasPorEstacion(
  catalogo: CatalogoTarifasCotizador = CATALOGO_TARIFAS_DEFECTO,
): Record<EstacionTarifa, number> {
  return Object.fromEntries(
    ESTACIONES_TARIFA.map((estacion) => [estacion, tarifaHoraDeEstacion(estacion, catalogo)]),
  ) as Record<EstacionTarifa, number>;
}

type GrupoConTarifa = {
  tarifaHora: number | null;
  tarifaMoneda: 'MXN' | 'USD';
  estacionTarifa: EstacionTarifa | null;
};

export type TarifaEfectivaGrupo = {
  tarifa: number;
  moneda: 'MXN' | 'USD';
  /**
   * `GRUPO` = tarifa propia del grupo; `ESTACION` = la de Tarifas / TC
   * vinculada; `RESPALDO` = último recurso, siempre con advertencia.
   */
  fuente: 'GRUPO' | 'ESTACION' | 'RESPALDO';
  estacion: EstacionTarifa | null;
  /** Origen legible para el ruteo (mismo texto que devuelve el resolvedor SQL). */
  origen: string;
  /** true solo cuando se usa la tarifa de respaldo. */
  advertencia: boolean;
};

/** Tarifa de respaldo válida (monto finito no negativo), o null. */
export function tarifaRespaldoValida(respaldo: number | null | undefined): number | null {
  return typeof respaldo === 'number' && Number.isFinite(respaldo) && respaldo >= 0
    ? respaldo
    : null;
}

/**
 * Tarifa que usará el costeo del ruteo para un Grupo de Equipo: la propia si la
 * tiene; si no, la de la estación vinculada en Tarifas / TC (siempre MXN); y
 * solo si no existe ninguna de las dos, la de respaldo, marcada como
 * advertencia. Espejo TS de `public.resolver_tarifa_hora` (sin el override por
 * máquina).
 */
export function tarifaEfectivaDeGrupo(
  grupo: GrupoConTarifa,
  catalogo: CatalogoTarifasCotizador = CATALOGO_TARIFAS_DEFECTO,
  respaldo: number | null = null,
): TarifaEfectivaGrupo | null {
  if (grupo.tarifaHora !== null) {
    return {
      tarifa: grupo.tarifaHora,
      moneda: grupo.tarifaMoneda,
      fuente: 'GRUPO',
      estacion: grupo.estacionTarifa,
      origen: 'Tarifa del grupo',
      advertencia: false,
    };
  }
  if (grupo.estacionTarifa !== null) {
    return {
      tarifa: tarifaHoraDeEstacion(grupo.estacionTarifa, catalogo),
      moneda: 'MXN',
      fuente: 'ESTACION',
      estacion: grupo.estacionTarifa,
      origen: `Tarifas / TC · ${ETIQUETA_ESTACION_TARIFA[grupo.estacionTarifa]}`,
      advertencia: false,
    };
  }
  const montoRespaldo = tarifaRespaldoValida(respaldo);
  if (montoRespaldo !== null) {
    return {
      tarifa: montoRespaldo,
      moneda: 'MXN',
      fuente: 'RESPALDO',
      estacion: null,
      origen: 'Tarifa de respaldo (el grupo no tiene tarifa estándar)',
      advertencia: true,
    };
  }
  return null;
}
