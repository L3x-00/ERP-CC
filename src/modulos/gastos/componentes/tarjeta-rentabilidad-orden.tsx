'use client';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { CalculoRentabilidadOrden } from '@/modulos/gastos/tipos/indice';

function claseMargen(margen: number | null): string {
  if (margen === null) return 'text-texto-secundario';
  if (margen >= 25) return 'text-exito-texto';
  if (margen >= 10) return 'text-advertencia-texto';
  return 'text-peligro-texto';
}

export function TarjetaRentabilidadOrden({ datos }: { datos: CalculoRentabilidadOrden | null }) {
  if (!datos) return null;
  return (
    <section className="rounded-lg border border-borde bg-superficie p-4 shadow-sm" aria-labelledby="titulo-rentabilidad">
      <h2 id="titulo-rentabilidad" className="text-lg font-semibold">Rentabilidad de la orden {datos.ordenId}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="text-xs text-texto-secundario">Venta explícita (MXN)</span><p className="font-semibold tabular-nums">{formatearMoneda(datos.ingresoMxn)}</p></div>
        <div><span className="text-xs text-texto-secundario">Costo total</span><p className="font-semibold tabular-nums">{formatearMoneda(datos.costoTotalMxn)}</p></div>
        <div><span className="text-xs text-texto-secundario">Utilidad bruta</span><p className="font-semibold tabular-nums">{formatearMoneda(datos.utilidadBrutaMxn)}</p></div>
        <div>
          <span className="text-xs text-texto-secundario">Margen</span>
          <p className={`font-semibold tabular-nums ${claseMargen(datos.margenPorcentaje)}`}>
            {datos.margenPorcentaje === null ? 'No calculable' : datos.margenPorcentaje.toFixed(2) + ' %'}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-texto-secundario">Materiales</dt><dd className="tabular-nums">{formatearMoneda(datos.costoMaterialesMxn)}</dd></div>
        <div><dt className="text-texto-secundario">Mano de obra</dt><dd className="tabular-nums">{formatearMoneda(datos.costoManoObraMxn)}</dd></div>
        <div><dt className="text-texto-secundario">Gastos directos</dt><dd className="tabular-nums">{formatearMoneda(datos.costoGastosDirectosMxn)}</dd></div>
      </dl>
      {datos.componentesFaltantes.length > 0 ? <p className="mt-3 text-sm text-advertencia-texto">Datos faltantes: {datos.componentesFaltantes.join(', ')}</p> : null}
    </section>
  );
}
