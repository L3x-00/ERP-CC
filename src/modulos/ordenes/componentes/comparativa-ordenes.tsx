import { formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import type { FilaComparativa } from '@/modulos/ordenes/utilidades/comparativa-ordenes';

export function ComparativaOrdenes({ filas, mostrarVentas }: {
  filas: readonly FilaComparativa[]; mostrarVentas: boolean;
}) {
  const estimadas = filas.reduce((suma, fila) => suma + fila.horasEstimadas, 0);
  const reales = filas.reduce((suma, fila) => suma + fila.horasReales, 0);
  const conTiempo = filas.filter((fila) => fila.eficiencia !== null);
  const promedioEficiencia = conTiempo.length
    ? conTiempo.reduce((suma, fila) => suma + (fila.eficiencia ?? 0), 0) / conTiempo.length : null;
  const ventaTotal = filas.reduce((suma, fila) => suma + (fila.ventaMxn ?? 0), 0);
  return (
    <details className="rounded-base border border-borde bg-superficie p-4">
      <summary className="cursor-pointer text-base font-semibold">Comparativa KPI de órdenes comerciales</summary>
      <p className="mt-2 text-sm text-texto-secundario">
        Eficiencia = horas estimadas / reales. Puntualidad según la primera nota de entrega final;
        una pausa registrada cuenta como incidencia. Órdenes internas y canceladas quedan fuera.
      </p>
      {filas.length === 0 ? <p className="mt-3 text-sm text-texto-secundario">Sin órdenes comerciales para comparar.</p> : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-texto-secundario sm:hidden">Desliza la tabla horizontalmente para ver todos los indicadores.</p>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Horas, eficiencia, puntualidad, sesiones, pausas y venta por orden</caption>
            <thead><tr className="border-b border-borde text-texto-secundario">
              <th scope="col" className="p-2">Orden</th>
              <th scope="col" className="p-2">Est. h</th>
              <th scope="col" className="p-2">Real h</th>
              <th scope="col" className="p-2">Eficiencia</th>
              <th scope="col" className="p-2">Puntualidad</th>
              <th scope="col" className="p-2">Sesiones</th>
              <th scope="col" className="p-2">Pausas</th>
              {mostrarVentas ? <th scope="col" className="p-2">Venta MXN</th> : null}
            </tr></thead>
            <tbody>{filas.map((fila) => <tr key={fila.ordenId} className="border-b border-borde">
              <th scope="row" className="p-2 font-mono text-xs">{fila.folio}</th>
              <td className="p-2 tabular-nums">{formatearNumero(fila.horasEstimadas)}</td>
              <td className="p-2 tabular-nums">{formatearNumero(fila.horasReales)}</td>
              <td className="p-2 tabular-nums">{fila.eficiencia === null ? 'Sin tiempo real' : `${formatearNumero(fila.eficiencia, 1)} %`}</td>
              <td className="p-2">{fila.puntual === null ? 'Sin entrega final' : fila.puntual ? 'A tiempo' : 'Tardía'}</td>
              <td className="p-2 tabular-nums">{fila.sesiones}</td>
              <td className="p-2 tabular-nums">{fila.incidencias}</td>
              {mostrarVentas ? <td className="p-2 tabular-nums">{fila.ventaMxn === null ? 'Sin cuenta' : formatearMoneda(fila.ventaMxn)}</td> : null}
            </tr>)}</tbody>
            <tfoot><tr className="font-semibold">
              <th scope="row" className="p-2">Total / promedio</th>
              <td className="p-2 tabular-nums">{formatearNumero(estimadas)}</td>
              <td className="p-2 tabular-nums">{formatearNumero(reales)}</td>
              <td className="p-2 tabular-nums">{promedioEficiencia === null ? '—' : `${formatearNumero(promedioEficiencia, 1)} %`}</td>
              <td className="p-2">{filas.filter((fila) => fila.puntual === true).length}/{filas.filter((fila) => fila.puntual !== null).length} a tiempo</td>
              <td className="p-2 tabular-nums">{filas.reduce((suma, fila) => suma + fila.sesiones, 0)}</td>
              <td className="p-2 tabular-nums">{filas.reduce((suma, fila) => suma + fila.incidencias, 0)}</td>
              {mostrarVentas ? <td className="p-2 tabular-nums">{filas.some((fila) => fila.ventaMxn !== null) ? formatearMoneda(ventaTotal) : 'Sin cuentas'}</td> : null}
            </tr></tfoot>
          </table>
          </div>
        </div>
      )}
    </details>
  );
}
