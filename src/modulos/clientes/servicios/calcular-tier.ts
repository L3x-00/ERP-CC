import {
  CATALOGO_TIERS_DEFECTO,
  type CatalogoTiers,
  type TierCliente,
} from '@/modulos/clientes/tipos/indice';

/** Tiers de mayor a menor umbral, para resolver el corte con el primero que pase. */
const TIERS_DESC: TierCliente[] = ['platino', 'oro', 'plata', 'bronce'];

/**
 * Determina el tier que corresponde a un consumo acumulado (MXN, últimos 3
 * meses) usando los umbrales del catálogo vigente (CFG-08). Función pura:
 * devuelve el tier más alto cuyo umbral no supera el consumo. Bronce es el piso.
 */
export function tierPorConsumo(
  consumo: number,
  catalogo: CatalogoTiers = CATALOGO_TIERS_DEFECTO,
): TierCliente {
  const monto = Number.isFinite(consumo) && consumo > 0 ? consumo : 0;
  for (const tier of TIERS_DESC) {
    if (monto >= catalogo.tiers[tier].umbralMxn) {
      return tier;
    }
  }
  return 'bronce';
}

/** Parámetros para resolver el tier efectivo de un cliente. */
export type ParametrosTier = {
  /** Consumo acumulado (MXN, últimos 3 meses). Origen real: Fase 8 (AR). */
  consumo: number;
  /** Tier asignado manualmente por un admin, o null. */
  tierManual: TierCliente | null;
  /** Caducidad ISO del tier manual, o null. */
  tierManualHasta: string | null;
  /** Momento de evaluación (inyectable para pruebas deterministas). */
  ahora: Date;
  /** Catálogo configurado; por defecto, los valores de fábrica. */
  catalogo?: CatalogoTiers;
};

/** Tier efectivo resuelto, con la bandera de si vino de asignación manual. */
export type ResultadoTier = {
  tier: TierCliente;
  esManual: boolean;
};

/** Tiers de menor a mayor beneficio, para comparar manual contra consumo. */
const TIERS_ASC: readonly TierCliente[] = ['bronce', 'plata', 'oro', 'platino'];

/**
 * Resuelve el tier EFECTIVO de un cliente.
 *
 * El tier manual vigente (`ahora < tierManualHasta`) nunca perjudica al
 * cliente: si su consumo ya le da un tier mejor, manda el consumo. Un manual
 * vencido o ausente se ignora por completo. Función pura y determinista (la
 * fecha y el catálogo se inyectan).
 */
export function calcularTier(p: ParametrosTier): ResultadoTier {
  const catalogo = p.catalogo ?? CATALOGO_TIERS_DEFECTO;
  const porConsumo = tierPorConsumo(p.consumo, catalogo);

  if (p.tierManual && p.tierManualHasta) {
    const vence = new Date(p.tierManualHasta).getTime();
    if (Number.isFinite(vence) && p.ahora.getTime() < vence) {
      const manualEsMejorOIgual =
        TIERS_ASC.indexOf(p.tierManual) >= TIERS_ASC.indexOf(porConsumo);
      return manualEsMejorOIgual
        ? { tier: p.tierManual, esManual: true }
        : { tier: porConsumo, esManual: false };
    }
  }

  return { tier: porConsumo, esManual: false };
}

/** Descuento porcentual asociado a un tier según el catálogo vigente. */
export function descuentoDeTier(
  tier: TierCliente,
  catalogo: CatalogoTiers = CATALOGO_TIERS_DEFECTO,
): number {
  return catalogo.tiers[tier].descuentoPorcentaje;
}
