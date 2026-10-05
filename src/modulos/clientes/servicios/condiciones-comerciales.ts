import type {
  CondicionesPagoCliente,
  MonedaCliente,
} from '@/modulos/clientes/tipos/indice';

/** Días de crédito que representa cada condición de pago heredada. */
const DIAS_POR_CONDICION: Record<CondicionesPagoCliente, number> = {
  contado: 0,
  '15_dias': 15,
  '30_dias': 30,
  credito: 45,
};

/** Crédito y condición de pago coherentes entre sí (SII-B2.4). */
export type CreditoResuelto = {
  creditoHabilitado: boolean;
  diasCredito: number;
  condicionesPago: CondicionesPagoCliente;
};

/** Normaliza una moneda desconocida al default seguro MXN. */
export function normalizarMoneda(valor: unknown): MonedaCliente {
  return valor === 'USD' ? 'USD' : 'MXN';
}

/** Condición de pago heredada equivalente a un crédito de N días. */
export function condicionesDesdeCredito(
  creditoHabilitado: boolean,
  diasCredito: number,
): CondicionesPagoCliente {
  if (!creditoHabilitado) return 'contado';
  if (diasCredito === 15) return '15_dias';
  if (diasCredito === 30) return '30_dias';
  return 'credito';
}

/** Deriva crédito/días desde `condiciones_pago` (mapeo histórico del plan). */
export function derivarCreditoDeCondiciones(
  condiciones: CondicionesPagoCliente,
): CreditoResuelto {
  return {
    creditoHabilitado: condiciones !== 'contado',
    diasCredito: DIAS_POR_CONDICION[condiciones],
    condicionesPago: condiciones,
  };
}

/**
 * Resuelve el trío coherente crédito/días/condiciones a partir de lo capturado.
 *
 * - `creditoHabilitado` explícito manda (false ⇒ 0 días y contado).
 * - Sin crédito explícito pero con días > 0 ⇒ crédito habilitado.
 * - Solo `condicionesPago` ⇒ mapeo histórico.
 * - Nada ⇒ `null` (no hay nada que sincronizar).
 *
 * @throws RangeError si los días están fuera de 1..365 con crédito habilitado.
 */
export function resolverCredito(entrada: {
  creditoHabilitado?: boolean;
  diasCredito?: number | null;
  condicionesPago?: CondicionesPagoCliente;
}): CreditoResuelto | null {
  const { creditoHabilitado, diasCredito, condicionesPago } = entrada;

  if (
    creditoHabilitado === undefined &&
    diasCredito === undefined &&
    condicionesPago === undefined
  ) {
    return null;
  }

  if (creditoHabilitado === false) {
    return { creditoHabilitado: false, diasCredito: 0, condicionesPago: 'contado' };
  }

  if (
    creditoHabilitado === true ||
    (diasCredito !== undefined && diasCredito !== null && diasCredito > 0)
  ) {
    const dias = diasCredito ?? 45;
    if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
      throw new RangeError('dias_credito_invalidos');
    }
    return {
      creditoHabilitado: true,
      diasCredito: dias,
      condicionesPago: condicionesDesdeCredito(true, dias),
    };
  }

  if (condicionesPago !== undefined) {
    return derivarCreditoDeCondiciones(condicionesPago);
  }

  return { creditoHabilitado: false, diasCredito: 0, condicionesPago: 'contado' };
}
