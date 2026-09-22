'use client';

import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import type {
  CalculoRentabilidadOrden,
  DesgloseRentabilidadOrden,
} from '@/modulos/gastos/tipos/indice';

function claseMargen(margen: number | null): string {
  if (margen === null) return 'text-texto-secundario';
  if (margen >= 25) return 'text-exito-texto';
  if (margen >= 10) return 'text-advertencia-texto';
  return 'text-peligro-texto';
}

/**
 * OBS-29: desglose por estación (horas estimadas vs reales y tarifa histórica),
 * material consumido y categorías de gasto. Los gastos ya representados en
 * material/mano de obra se muestran marcados y no suman.
 */
function DesgloseRentabilidad({
  desglose,
}: {
  desglose: readonly DesgloseRentabilidadOrden[];
}) {
  if (desglose.length === 0) return null;

  const manoObra = desglose.filter((renglon) => renglon.rubro === 'mano_obra');
  const materiales = desglose.filter((renglon) => renglon.rubro === 'material');
  const gastos = desglose.filter((renglon) => renglon.rubro === 'gasto');
  const incluidos = desglose.filter((renglon) => renglon.rubro === 'gasto_incluido');

  return (
    <details
      className="mt-4 rounded-md border border-borde bg-superficie-2/50 p-3"
      data-testid="desglose-rentabilidad"
    >
      <summary className="cursor-pointer text-sm font-medium text-texto-primario">
        Desglose por estación y rubro
      </summary>

      {manoObra.length > 0 ? (
        <section className="mt-3 flex flex-col gap-1" aria-label="Mano de obra por estación">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            Mano de obra por estación
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {manoObra.map((renglon) => (
              <li
                key={`${renglon.rubro}-${renglon.referencia ?? renglon.concepto}-${renglon.tarifaHora ?? 0}`}
                className="flex flex-wrap justify-between gap-2"
              >
                <span className="text-texto-secundario">
                  {renglon.concepto}
                  {renglon.horasReales !== null ? (
                    <span className="ml-2 text-xs">
                      {formatearNumero(renglon.horasReales, 2)} h reales /{' '}
                      {formatearNumero(renglon.horasEstimadas ?? 0, 2)} h estimadas
                    </span>
                  ) : null}
                  {renglon.tarifaHora !== null ? (
                    <span className="ml-2 text-xs">
                      @ {formatearMoneda(renglon.tarifaHora)}/h
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatearMoneda(renglon.importe)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {materiales.length > 0 ? (
        <section className="mt-3 flex flex-col gap-1" aria-label="Material consumido">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            Material consumido
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {materiales.map((renglon) => (
              <li key={`${renglon.rubro}-${renglon.referencia ?? renglon.concepto}`} className="flex justify-between gap-2">
                <span className="text-texto-secundario">{renglon.concepto}</span>
                <span className="tabular-nums">{formatearMoneda(renglon.importe)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {gastos.length > 0 ? (
        <section className="mt-3 flex flex-col gap-1" aria-label="Gastos directos">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            Gastos directos
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {gastos.map((renglon) => (
              <li key={`${renglon.rubro}-${renglon.concepto}`} className="flex justify-between gap-2">
                <span className="text-texto-secundario">{renglon.concepto}</span>
                <span className="tabular-nums">{formatearMoneda(renglon.importe)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {incluidos.length > 0 ? (
        <section className="mt-3 flex flex-col gap-1" aria-label="Gastos ya incluidos en rubros">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">
            Ya incluidos en sus rubros (no suman)
          </h3>
          <ul className="flex flex-col gap-1 text-sm" data-testid="desglose-incluidos">
            {incluidos.map((renglon) => (
              <li key={`${renglon.rubro}-${renglon.concepto}`} className="flex flex-wrap justify-between gap-2">
                <span className="text-texto-secundario">
                  {renglon.concepto}
                  <span className="ml-2 rounded-full bg-superficie-2 px-2 py-0.5 text-[10px] font-semibold text-texto-secundario">
                    No suma
                  </span>
                  {renglon.nota ? <span className="ml-2 text-xs">{renglon.nota}</span> : null}
                </span>
                <span className="tabular-nums text-texto-secundario">
                  {formatearMoneda(renglon.importe)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </details>
  );
}

/**
 * Rentabilidad de una orden comercial o **costo de producción de un trabajo
 * interno (TI)**: los TI no generan precio de venta ni AR, así que se informa
 * su costo con el mismo agregado transaccional (materiales, mano de obra y
 * gastos directos). El desglose OBS-29 se añade cuando el consumidor lo carga.
 */
export function TarjetaRentabilidadOrden({
  datos,
  desglose = null,
}: {
  datos: CalculoRentabilidadOrden | null;
  desglose?: readonly DesgloseRentabilidadOrden[] | null;
}) {
  if (!datos) return null;

  const notaIncluidos =
    datos.gastosIncluidosEnRubros > 0
      ? `${formatearNumero(datos.gastosIncluidosEnRubros, 0)} gasto(s) de material/nómina ya incluidos en sus rubros; no suman al costo.`
      : null;

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
        {notaIncluidos ? (
          <p className="mt-2 text-sm text-texto-secundario">{notaIncluidos}</p>
        ) : null}
        {desglose ? <DesgloseRentabilidad desglose={desglose} /> : null}
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
      {notaIncluidos ? (
        <p className="mt-2 text-sm text-texto-secundario">{notaIncluidos}</p>
      ) : null}
      {datos.componentesFaltantes.length > 0 ? <p className="mt-3 text-sm text-advertencia-texto">Datos faltantes: {datos.componentesFaltantes.join(', ')}</p> : null}
      {desglose ? <DesgloseRentabilidad desglose={desglose} /> : null}
    </section>
  );
}
