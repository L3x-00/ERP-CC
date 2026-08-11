'use client';

import { usarMovimientosInventario } from '@/modulos/inventario/hooks/usar-movimientos-inventario';
import { Badge } from '@/compartido/componentes/ui/badge';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { ETIQUETA_TIPO_MOVIMIENTO } from '@/modulos/inventario/utilidades/indice';
import type { TipoMovimiento } from '@/modulos/inventario/tipos/inventario';

/** Variante de badge según el tipo de movimiento (entradas suman, salidas restan). */
function varianteTipo(tipo: TipoMovimiento): 'exito' | 'alerta' | 'info' {
  if (tipo === 'entrada_compra' || tipo === 'devolucion') return 'exito';
  if (tipo === 'salida_produccion') return 'alerta';
  return 'info';
}

/**
 * Historial/auditoría de movimientos de inventario (kardex): folios ENT-/SAL-,
 * tipo, cantidades y fecha. Consume `usarMovimientosInventario()`.
 */
export function TablaMovimientos() {
  const { data, isLoading, isError } = usarMovimientosInventario();
  const movimientos = data?.registros ?? [];

  return (
    <div className="overflow-x-auto rounded-base border border-foreground/10">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-foreground/10 bg-foreground/5 text-xs uppercase text-foreground/60">
          <tr>
            <th className="px-3 py-2">Folio</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2 text-right">Cant. compra</th>
            <th className="px-3 py-2 text-right">Cant. control</th>
            <th className="px-3 py-2 text-right">Costo unit.</th>
            <th className="px-3 py-2">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/5">
          {isLoading && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-foreground/60">
                Cargando…
              </td>
            </tr>
          )}
          {isError && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-red-600">
                No se pudo cargar el historial.
              </td>
            </tr>
          )}
          {!isLoading && !isError && movimientos.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-foreground/60">
                Sin movimientos.
              </td>
            </tr>
          )}
          {movimientos.map((movimiento) => (
            <tr key={movimiento.id} className="hover:bg-foreground/5">
              <td className="px-3 py-2 font-mono text-xs">{movimiento.folio}</td>
              <td className="px-3 py-2">
                <Badge variante={varianteTipo(movimiento.tipoMovimiento)}>
                  {ETIQUETA_TIPO_MOVIMIENTO[movimiento.tipoMovimiento]}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right">
                {movimiento.cantidadCompra === null
                  ? '—'
                  : movimiento.cantidadCompra.toLocaleString('es-MX')}
              </td>
              <td className="px-3 py-2 text-right">
                {movimiento.cantidadControl.toLocaleString('es-MX')}
              </td>
              <td className="px-3 py-2 text-right">
                {movimiento.costoUnitarioMomento.toLocaleString('es-MX', {
                  style: 'currency',
                  currency: 'MXN',
                })}
              </td>
              <td className="px-3 py-2">{formatearFecha(movimiento.creadoEn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
