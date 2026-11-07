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
   * `GRUPO` = tarifa estándar del grupo (fuente maestra); `RESPALDO` = último
   * recurso, siempre con advertencia.
   */
  fuente: 'GRUPO' | 'RESPALDO';
  /** Estación de referencia de Tarifas / TC; no participa en el cálculo. */
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
 * Tarifa que usará el costeo del ruteo para un Grupo de Equipo.
 *
 * T2 2026-11-06: la fuente maestra es `grupos_equipo.tarifa_hora`. La estación
 * de Tarifas / TC es solo una referencia para copiar su valor; no compite en el
 * cálculo. Solo si el grupo no tiene tarifa estándar se usa el respaldo, con
 * advertencia. Espejo TS de `public.resolver_tarifa_hora` (sin el override por
 * máquina).
 */
export function tarifaEfectivaDeGrupo(
  grupo: GrupoConTarifa,
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
