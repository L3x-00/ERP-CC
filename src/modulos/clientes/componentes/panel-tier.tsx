'use client';

import { calcularTier, descuentoDeTier, tierPorConsumo } from '@/modulos/clientes/servicios/calcular-tier';
import type { Cliente, TierCliente } from '@/modulos/clientes/tipos/indice';
import { ETIQUETA_TIER } from '@/modulos/clientes/utilidades/indice';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';

/** Tiers de menor a mayor, para localizar el siguiente por consumo. */
const ORDEN_TIER: readonly TierCliente[] = ['bronce', 'plata', 'oro', 'platino'];

/**
 * Progreso de tier del cliente (CLI-03/CLI-05): muestra el tier efectivo y su
 * descuento, el consumo acumulado de los últimos 3 meses, el siguiente tier por
 * consumo, el importe que falta para alcanzarlo y una barra de progreso. El tier
 * efectivo respeta el manual vigente (más beneficioso); el progreso se mide
 * siempre contra los umbrales del catálogo configurado (CFG-08).
 */
export function PanelTier({ cliente, consumo }: { cliente: Cliente; consumo: number }) {
  const { tiers } = usarCatalogosComerciales();
  const monto = Number.isFinite(consumo) && consumo > 0 ? consumo : 0;
  const { tier, esManual } = calcularTier({
    consumo: monto,
    tierManual: cliente.tierManual,
    tierManualHasta: cliente.tierManualHasta,
    ahora: new Date(),
    catalogo: tiers,
  });

  const tierConsumo = tierPorConsumo(monto, tiers);
  const indice = ORDEN_TIER.indexOf(tierConsumo);
  const siguiente = indice >= 0 && indice < ORDEN_TIER.length - 1 ? ORDEN_TIER[indice + 1] : null;

  const base = tiers.tiers[tierConsumo].umbralMxn;
  const objetivo = siguiente ? tiers.tiers[siguiente].umbralMxn : null;
  const faltante = objetivo !== null ? Math.max(objetivo - monto, 0) : 0;
  const progreso =
    objetivo !== null && objetivo > base
      ? Math.min(Math.max(((monto - base) / (objetivo - base)) * 100, 0), 100)
      : 100;

  return (
    <section className="grid gap-2 rounded-lg border border-borde bg-superficie-2 p-3 text-sm" aria-label="Progreso de tier">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-texto-primario">
          Tier {ETIQUETA_TIER[tier]}
          {esManual && <span className="ml-1 text-xs font-normal text-texto-secundario">· manual vigente</span>}
        </span>
        <span className="tabular-nums text-texto-secundario">Descuento {descuentoDeTier(tier, tiers)}%</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-texto-secundario">Consumo (últimos 3 meses)</span>
        <span className="font-medium tabular-nums">{formatearMoneda(monto)}</span>
      </div>

      {siguiente && objetivo !== null ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-texto-secundario">
              Siguiente: <span className="font-medium text-texto-primario">{ETIQUETA_TIER[siguiente]}</span>
            </span>
            <span className="tabular-nums text-texto-secundario">Faltan {formatearMoneda(faltante)}</span>
          </div>
          <BarraProgreso valor={progreso} tono="acento" etiqueta={`Progreso a ${ETIQUETA_TIER[siguiente]}`} mostrarPorcentaje />
        </>
      ) : (
        <p className="text-texto-secundario">Nivel de tier máximo alcanzado por consumo.</p>
      )}
    </section>
  );
}
