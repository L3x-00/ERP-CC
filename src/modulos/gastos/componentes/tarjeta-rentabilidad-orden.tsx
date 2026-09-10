'use client';

import type { CalculoRentabilidadOrden } from '@/modulos/gastos/tipos/indice';

function moneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(valor);
}

export function TarjetaRentabilidadOrden({ datos }: { datos: CalculoRentabilidadOrden | null }) {
  if (!datos) return null;
  return (
    <section className="rounded-base border border-foreground/15 p-4" aria-labelledby="titulo-rentabilidad">
      <h2 id="titulo-rentabilidad" className="text-lg font-semibold">Rentabilidad de la orden {datos.ordenId}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="text-xs text-foreground/65">Venta explícita (MXN)</span><p className="font-semibold tabular-nums">{moneda(datos.ingresoMxn)}</p></div>
        <div><span className="text-xs text-foreground/65">Costo total</span><p className="font-semibold tabular-nums">{moneda(datos.costoTotalMxn)}</p></div>
        <div><span className="text-xs text-foreground/65">Utilidad bruta</span><p className="font-semibold tabular-nums">{moneda(datos.utilidadBrutaMxn)}</p></div>
        <div><span className="text-xs text-foreground/65">Margen</span><p className="font-semibold tabular-nums">{datos.margenPorcentaje === null ? 'No calculable' : datos.margenPorcentaje.toFixed(2) + ' %'}</p></div>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-foreground/65">Materiales</dt><dd>{moneda(datos.costoMaterialesMxn)}</dd></div>
        <div><dt className="text-foreground/65">Mano de obra</dt><dd>{moneda(datos.costoManoObraMxn)}</dd></div>
        <div><dt className="text-foreground/65">Gastos directos</dt><dd>{moneda(datos.costoGastosDirectosMxn)}</dd></div>
      </dl>
      {datos.componentesFaltantes.length > 0 ? <p className="mt-3 text-sm text-amber-700">Datos faltantes: {datos.componentesFaltantes.join(', ')}</p> : null}
    </section>
  );
}
