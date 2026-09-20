'use client';

import { BadgeTier } from '@/modulos/clientes/componentes/badge-tier';
import { calcularTier, descuentoDeTier } from '@/modulos/clientes/servicios/calcular-tier';
import { usarCliente } from '@/modulos/clientes/hooks/usar-cliente';
import { usarCatalogosComerciales } from '@/modulos/configuracion/hooks/usar-catalogos-comerciales';
import { ETIQUETA_CONDICIONES_PAGO } from '@/modulos/pipeline/utilidades/indice';
import type { CondicionesPago } from '@/modulos/pipeline/tipos/indice';

/**
 * Resumen comercial del cliente ligado a la RFQ — RFQ-03: tier EFECTIVO (con el
 * consumo AR real de la ficha, no un tier copiado) y condiciones de pago que
 * hereda la cotización.
 *
 * El descuento del tier se muestra como referencia para el vendedor: aplicarlo
 * como línea de la cotización depende del contrato SQL de `es_descuento`
 * (migración 20260916000004) y NO forma parte de este componente.
 */
export function ResumenClienteRfq({
  clienteId,
  condicionesPago,
}: {
  clienteId: string;
  condicionesPago: CondicionesPago | null;
}) {
  const { data, isLoading, isError } = usarCliente(clienteId);
  const { tiers } = usarCatalogosComerciales();

  const condiciones =
    condicionesPago === null ? 'Sin especificar' : ETIQUETA_CONDICIONES_PAGO[condicionesPago];

  if (isLoading) {
    return (
      <p className="text-xs text-texto-secundario">Cargando datos comerciales del cliente…</p>
    );
  }

  // Un fallo de la ficha no debe ocultar lo que la RFQ ya sabe: las condiciones
  // heredadas viven en la oportunidad, no en esta consulta.
  if (isError || !data) {
    return (
      <p className="text-xs text-texto-secundario">
        Condiciones de pago: <span className="font-medium">{condiciones}</span> · tier no
        disponible.
      </p>
    );
  }

  const { tier } = calcularTier({
    consumo: data.consumoUltimos3Meses,
    tierManual: data.cliente.tierManual,
    tierManualHasta: data.cliente.tierManualHasta,
    ahora: new Date(),
    catalogo: tiers,
  });
  const descuento = descuentoDeTier(tier, tiers);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
      <BadgeTier cliente={data.cliente} consumo={data.consumoUltimos3Meses} />
      <span>
        Condiciones de pago: <span className="font-medium">{condiciones}</span>
      </span>
      {descuento > 0 && (
        <span>
          · Descuento de tier: <span className="font-medium">{descuento}%</span> (informativo, no
          se agrega solo a la cotización)
        </span>
      )}
    </div>
  );
}
