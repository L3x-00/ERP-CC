'use client';

import { calcularTier } from '@/modulos/clientes/servicios/calcular-tier';
import type { Cliente } from '@/modulos/clientes/tipos/indice';
import { CLASE_TIER, ETIQUETA_TIER } from '@/modulos/clientes/utilidades/indice';

/**
 * Badge del tier EFECTIVO del cliente. Resuelve manual-vigente vs automático con
 * `calcularTier` usando el consumo MXN calculado por el servidor (AR de los
 * últimos 3 meses). El tier manual vigente gana sobre el automático. Marca
 * "· manual" cuando aplica un override.
 */
export function BadgeTier({ cliente, consumo = 0 }: { cliente: Cliente; consumo?: number }) {
  const { tier, esManual } = calcularTier({
    consumo,
    tierManual: cliente.tierManual,
    tierManualHasta: cliente.tierManualHasta,
    ahora: new Date(),
  });

  return (
    <span
      className={`inline-flex items-center rounded-base px-2 py-0.5 text-xs font-semibold ${CLASE_TIER[tier]}`}
      title={esManual ? 'Tier asignado manualmente' : 'Tier por consumo'}
    >
      {ETIQUETA_TIER[tier]}
      {esManual && <span className="ml-1 opacity-70">· manual</span>}
    </span>
  );
}
