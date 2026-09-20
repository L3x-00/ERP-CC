'use client';

import { calcularTier } from '@/modulos/clientes/servicios/calcular-tier';
import type { Cliente, TierCliente } from '@/modulos/clientes/tipos/indice';
import { ETIQUETA_TIER } from '@/modulos/clientes/utilidades/indice';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';

/** Tokens de tier del sistema de diseño (fondo suave + texto legible). */
const CLASE_TIER: Record<TierCliente, string> = {
  bronce: 'bg-tier-bronce-suave text-tier-bronce',
  plata: 'bg-tier-plata-suave text-tier-plata',
  oro: 'bg-tier-oro-suave text-tier-oro',
  platino: 'bg-tier-platino-suave text-tier-platino',
};

/**
 * Badge del tier EFECTIVO del cliente. Resuelve manual-vigente vs automático con
 * `calcularTier` usando el consumo MXN calculado por el servidor (AR de los
 * últimos 3 meses) y los umbrales configurados (CFG-08). El tier manual vigente
 * gana sobre el automático. Marca "· manual" cuando aplica un override.
 */
export function BadgeTier({ cliente, consumo = 0 }: { cliente: Cliente; consumo?: number }) {
  const { tiers } = usarCatalogosComerciales();
  const { tier, esManual } = calcularTier({
    consumo,
    tierManual: cliente.tierManual,
    tierManualHasta: cliente.tierManualHasta,
    ahora: new Date(),
    catalogo: tiers,
  });

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASE_TIER[tier]}`}
      title={esManual ? 'Tier asignado manualmente' : 'Tier por consumo'}
    >
      {ETIQUETA_TIER[tier]}
      {esManual && <span className="ml-1 opacity-70">· manual</span>}
    </span>
  );
}
