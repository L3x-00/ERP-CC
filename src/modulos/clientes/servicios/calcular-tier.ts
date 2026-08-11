import {
  DESCUENTO_TIER,
  UMBRAL_TIER,
  type TierCliente,
} from '@/modulos/clientes/tipos/indice';

/** Tiers de mayor a menor umbral, para resolver el corte con el primero que pase. */
const TIERS_DESC: TierCliente[] = ['platino', 'oro', 'plata', 'bronce'];

/**
 * Determina el tier que corresponde a un consumo acumulado (MXN, últimos 3
 * meses). Función pura: devuelve el tier más alto cuyo umbral no supera el
 * consumo. Bronce es el piso.
 *
 * @param consumo Consumo acumulado en MXN (>= 0).
 * @returns Tier automático por consumo.
 */
export function tierPorConsumo(consumo: number): TierCliente {
  const monto = Number.isFinite(consumo) && consumo > 0 ? consumo : 0;
  for (const tier of TIERS_DESC) {
    if (monto >= UMBRAL_TIER[tier]) {
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
};

/** Tier efectivo resuelto, con la bandera de si vino de asignación manual. */
export type ResultadoTier = {
  tier: TierCliente;
  esManual: boolean;
};

/**
 * Resuelve el tier EFECTIVO de un cliente.
 *
 * El tier manual manda mientras no venza (`ahora < tierManualHasta`). Vencido o
 * ausente, se cae al tier automático por consumo. Función pura y determinista
 * (la fecha se inyecta).
 *
 * @param p Consumo, tier manual, caducidad y momento de evaluación.
 * @returns Tier efectivo y si proviene de asignación manual vigente.
 */
export function calcularTier(p: ParametrosTier): ResultadoTier {
  if (p.tierManual && p.tierManualHasta) {
    const vence = new Date(p.tierManualHasta).getTime();
    if (Number.isFinite(vence) && p.ahora.getTime() < vence) {
      return { tier: p.tierManual, esManual: true };
    }
  }
  return { tier: tierPorConsumo(p.consumo), esManual: false };
}

/** Descuento porcentual asociado a un tier. */
export function descuentoDeTier(tier: TierCliente): number {
  return DESCUENTO_TIER[tier];
}
