'use client';

import { useMemo } from 'react';
import { usarMateriales } from '@/modulos/inventario/hooks/usar-materiales';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { esStockBajo, valorInventario } from '@/modulos/inventario/utilidades/indice';

/**
 * Tarjetas de métricas del inventario: total de ítems, ítems bajo stock mínimo y
 * valor total estimado. El total de ítems es exacto (count del servidor); el
 * conteo de alertas y el valor se calculan sobre los materiales cargados.
 */
export function MetricasInventario() {
  const { data } = usarMateriales();

  const { total, bajoMinimo, valor } = useMemo(() => {
    const registros = data?.registros ?? [];
    return {
      total: data?.total ?? 0,
      bajoMinimo: registros.filter(esStockBajo).length,
      valor: registros.reduce((suma, material) => suma + valorInventario(material), 0),
    };
  }, [data]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tarjeta etiqueta="Total de ítems" valor={total.toLocaleString('es-MX')} />
      <Tarjeta
        etiqueta="Ítems bajo stock mínimo"
        valor={bajoMinimo.toLocaleString('es-MX')}
        alerta={bajoMinimo > 0}
      />
      <Tarjeta etiqueta="Valor total estimado" valor={formatearMoneda(valor)} />
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  alerta = false,
}: {
  etiqueta: string;
  valor: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-base border border-foreground/10 p-4">
      <p className="text-xs uppercase text-foreground/60">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold ${alerta ? 'text-red-600 dark:text-red-400' : ''}`}>
        {valor}
      </p>
    </div>
  );
}
