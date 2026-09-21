'use client';

import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import type { CalculoRentabilidadOrden } from '@/modulos/gastos/tipos/indice';

function claseMargen(margen: number | null): string {
  if (margen === null) return 'text-texto-secundario';
  if (margen >= 25) return 'text-exito-texto';
  if (margen >= 10) return 'text-advertencia-texto';
  return 'text-peligro-texto';
}

/**
 * Rentabilidad de una orden comercial o **costo de producción de un trabajo
 * interno (TI)**: los TI no generan precio de venta ni AR, así que se informa
 * su costo con el mismo agregado transaccional (materiales, mano de obra y
 * gastos directos).
 */
export function TarjetaRentabilidadOrden({ datos }: { datos: CalculoRentabilidadOrden | null }) {
  if (!datos) return null;

  if (datos.esInterna) {
    return (
      <section
        className="rounded-lg border border-borde bg-superficie p-4 shadow-sm"
        aria-labelledby="titulo-rentabilidad"
        data-testid="tarjeta-rentabilidad-ti"
      >
        <h2 id="titulo-rentabilidad" className="text-lg font-semibold">
          Costo de producción · {datos.folio}
        </h2>
        <p className="mt-1 text-sm text-texto-secundario">
          Trabajo interno (TI): no genera precio de venta ni cuenta por cobrar; este es su costo de
          producción.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs text-texto-secundario">Costo total (MXN)</span>
            <p className="font-semibold tabular-nums" data-testid="rentabilidad-ti-costo">
              {formatearMoneda(datos.costoTotalMxn)}
            </p>
          </div>
          <div>
            <span className="text-xs text-texto-secundario">Materiales</span>
            <p className="font-semibold tabular-nums">{formatearMoneda(datos.costoMaterialesMxn)}</p>
          </div>
          <div>
            <span className="text-xs text-texto-secundario">Mano de obra</span>
            <p className="font-semibold tabular-nums">{formatearMoneda(datos.costoManoObraMxn)}</p>
          </div>
          <div>
            <span className="text-xs text-texto-secundario">Gastos directos</span>
            <p className="font-semibold tabular-nums">
              {formatearMoneda(datos.costoGastosDirectosMxn)}
            </p>
          </div>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-texto-secundario">Materiales considerados</dt>
            <dd className="tabular-nums">{formatearNumero(datos.materialesConsiderados, 0)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Sesiones consideradas</dt>
            <dd className="tabular-nums">{formatearNumero(datos.sesionesConsideradas, 0)}</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Gastos considerados</dt>
            <dd className="tabular-nums">
              {formatearNumero(datos.gastosConsiderados, 0)}
              {datos.gastosExcluidos > 0 ? ` (+${formatearNumero(datos.gastosExcluidos, 0)} cancelados)` : ''}
            </dd>
          </div>
        </dl>
        {datos.sesionesSinTarifa > 0 ? (
          <p className="mt-3 text-sm text-advertencia-texto">
            {formatearNumero(datos.sesionesSinTarifa, 0)} sesión(es) sin tarifa interna: el costo de
            mano de obra está subestimado.
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4 shadow-sm" aria-labelledby="titulo-rentabilidad">
      <h2 id="titulo-rentabilidad" className="text-lg font-semibold">Rentabilidad de la orden {datos.folio}</h2>
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
