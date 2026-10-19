'use client';

import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import {
  ETIQUETA_CONCEPTO_CONCILIACION,
  ETIQUETA_FUENTE_CONCILIACION,
  type ConciliacionCostosOrden,
} from '@/modulos/gastos/tipos/indice';

/** C10.2: signo explícito para que la variación se lea sin ambigüedad. */
export function formatearVariacionMonto(valor: number | null): string {
  if (valor === null) return '—';
  const monto = formatearMoneda(Math.abs(valor));
  if (valor === 0) return monto;
  return `${valor > 0 ? '+' : '-'}${monto}`;
}

export function formatearVariacionPct(valor: number | null): string {
  if (valor === null) return '—';
  const porcentaje = `${Math.abs(valor).toFixed(1)} %`;
  if (valor === 0) return porcentaje;
  return `${valor > 0 ? '+' : '-'}${porcentaje}`;
}

export function formatearMargen(valor: number | null): string {
  return valor === null ? 'No calculable' : `${valor.toFixed(1)} %`;
}

function etiquetaFuentes(fuentes: ConciliacionCostosOrden['conceptos'][number]['fuentes']): string {
  if (fuentes.length === 0) return '—';
  return fuentes.map((fuente) => ETIQUETA_FUENTE_CONCILIACION[fuente]).join(' · ');
}

/**
 * C10.2: tabla de conciliación por concepto. Una Orden interna no muestra la
 * tabla; una Orden sin Propuesta muestra «Sin estimado», nunca 0.
 */
export function TablaConciliacionCostos({ datos }: { datos: ConciliacionCostosOrden }) {
  if (datos.esInterna) return null;

  const sinEstimado = datos.tieneEstimado ? null : 'Sin estimado';

  return (
    <section
      className="rounded-lg border border-borde bg-superficie p-4 shadow-sm"
      aria-labelledby="titulo-conciliacion"
      data-testid="tabla-conciliacion-costos"
    >
      <header className="grid gap-1">
        <h2 id="titulo-conciliacion" className="text-lg font-semibold">Conciliación de costos</h2>
        <p className="text-sm text-texto-secundario">
          Base: venta de la Propuesta aceptada sin IVA. La tarjeta de rentabilidad no
          incluye compras; esta tabla sí suma compras de servicios recibidas.
        </p>
        {sinEstimado ? (
          <p className="text-sm text-advertencia-texto" data-testid="conciliacion-sin-estimado">
            Sin estimado: la Orden no tiene Propuesta de origen.
          </p>
        ) : null}
      </header>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Estimado, comprometido, real y variación por concepto de la Orden
          </caption>
          <thead className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-secundario">
            <tr>
              <th scope="col" className="px-3 py-2">Concepto</th>
              <th scope="col" className="px-3 py-2 text-right">Estimado</th>
              <th scope="col" className="px-3 py-2 text-right">Comprometido</th>
              <th scope="col" className="px-3 py-2 text-right">Real</th>
              <th scope="col" className="px-3 py-2 text-right">Variación</th>
              <th scope="col" className="px-3 py-2 text-right">%</th>
              <th scope="col" className="px-3 py-2">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {datos.conceptos.map((fila) => (
              <tr key={fila.concepto} data-testid={`conciliacion-fila-${fila.concepto}`} className="border-t border-borde">
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {ETIQUETA_CONCEPTO_CONCILIACION[fila.concepto]}
                </th>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`conciliacion-${fila.concepto}-estimado`}>
                  {fila.estimado === null ? 'Sin estimado' : formatearMoneda(fila.estimado)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`conciliacion-${fila.concepto}-comprometido`}>
                  {formatearMoneda(fila.comprometido)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`conciliacion-${fila.concepto}-real`}>
                  {formatearMoneda(fila.real)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`conciliacion-${fila.concepto}-variacion`}>
                  {formatearVariacionMonto(fila.variacionAbs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" data-testid={`conciliacion-${fila.concepto}-variacion-pct`}>
                  {formatearVariacionPct(fila.variacionPct)}
                </td>
                <td className="px-3 py-2 text-texto-secundario" data-testid={`conciliacion-${fila.concepto}-fuente`}>
                  {etiquetaFuentes(fila.fuentes)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-borde font-semibold" data-testid="conciliacion-total">
              <th scope="row" className="px-3 py-2 text-left">Total</th>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="conciliacion-total-estimado">
                {datos.totales.estimado === null ? 'Sin estimado' : formatearMoneda(datos.totales.estimado)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="conciliacion-total-comprometido">
                {formatearMoneda(datos.totales.comprometido)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="conciliacion-total-real">
                {formatearMoneda(datos.totales.real)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="conciliacion-total-variacion">
                {formatearVariacionMonto(datos.totales.variacionAbs)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="conciliacion-total-variacion-pct">
                {formatearVariacionPct(datos.totales.variacionPct)}
              </td>
              <td className="px-3 py-2 text-texto-secundario">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-texto-secundario">Venta base estimada (sin IVA)</dt>
          <dd className="font-semibold tabular-nums" data-testid="conciliacion-venta-estimada">
            {datos.ventaBaseEstimadoMxn === null ? 'No calculable' : formatearMoneda(datos.ventaBaseEstimadoMxn)}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Venta base real (sin IVA)</dt>
          <dd className="font-semibold tabular-nums" data-testid="conciliacion-venta-real">
            {datos.ventaBaseRealMxn === null ? 'No calculable' : formatearMoneda(datos.ventaBaseRealMxn)}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Margen estimado</dt>
          <dd className="font-semibold tabular-nums" data-testid="conciliacion-margen-estimado">
            {formatearMargen(datos.margenEstimadoPct)}
          </dd>
        </div>
        <div>
          <dt className="text-texto-secundario">Margen real</dt>
          <dd className="font-semibold tabular-nums" data-testid="conciliacion-margen-real">
            {formatearMargen(datos.margenRealPct)}
          </dd>
        </div>
      </dl>

      {datos.avisos.comprasSinRubro.n > 0 ? (
        <p className="mt-3 text-sm text-advertencia-texto" data-testid="conciliacion-aviso-compras-sin-rubro">
          {formatearNumero(datos.avisos.comprasSinRubro.n, 0)} compra(s) con Orden sin rubro
          ({formatearMoneda(datos.avisos.comprasSinRubro.importe)}) no suman; clasifícalas en Compras.
        </p>
      ) : null}
      {datos.avisos.comprasPagadasSinRecepcion.n > 0 ? (
        <p className="mt-2 text-sm text-advertencia-texto" data-testid="conciliacion-aviso-pagadas-sin-recepcion">
          {formatearNumero(datos.avisos.comprasPagadasSinRecepcion.n, 0)} compra(s) pagadas sin recepción
          ({formatearMoneda(datos.avisos.comprasPagadasSinRecepcion.importe)}) no cuentan como real.
        </p>
      ) : null}
      {datos.avisos.gastosIncluidosEnRubros.n > 0 ? (
        <p className="mt-2 text-sm text-texto-secundario" data-testid="conciliacion-aviso-gastos-incluidos">
          {formatearNumero(datos.avisos.gastosIncluidosEnRubros.n, 0)} gasto(s) de materia prima/nómina
          ({formatearMoneda(datos.avisos.gastosIncluidosEnRubros.importe)}) ya están en material o
          fabricación; no suman.
        </p>
      ) : null}

      <p className="mt-3 text-xs text-texto-secundario" data-testid="conciliacion-pie-ajuste">
        Ajuste manual: no disponible en este corte.
      </p>
    </section>
  );
}
