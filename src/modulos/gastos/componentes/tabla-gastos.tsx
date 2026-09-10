'use client';

import { Button } from '@/compartido/componentes/ui/button';
import type { EstadoGasto, Gasto } from '@/modulos/gastos/tipos/indice';

function formatoMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valor);
}

export interface TablaGastosProps {
  gastos: readonly Gasto[];
  onCambiarEstado: (gasto: Gasto, estado: EstadoGasto) => void;
  onVerRentabilidad: (ordenId: string) => void;
}

export function TablaGastos({ gastos, onCambiarEstado, onVerRentabilidad }: TablaGastosProps) {
  if (gastos.length === 0) {
    return <p className="rounded-base border border-dashed border-foreground/20 p-6 text-sm text-foreground/65">No hay gastos con los filtros actuales.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-base border border-foreground/15">
      <table className="w-full min-w-[980px] text-left text-sm">
        <caption className="sr-only">Gastos registrados</caption>
        <thead className="bg-foreground/5 text-xs text-foreground/70">
          <tr>
            <th className="px-3 py-2">Folio</th>
            <th className="px-3 py-2">Descripción</th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2">Proveedor</th>
            <th className="px-3 py-2">Orden vinculada</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Fecha</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {gastos.map((gasto) => (
            <tr key={gasto.id} className="border-t border-foreground/10">
              <td className="px-3 py-2 font-medium">{gasto.folio}</td>
              <td className="px-3 py-2">{gasto.descripcion}</td>
              <td className="px-3 py-2">{gasto.categoria}</td>
              <td className="px-3 py-2 font-mono text-xs">{gasto.proveedorId ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs">{gasto.ordenId ?? 'Indirecto'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(gasto.montoTotal, gasto.moneda)}</td>
              <td className="px-3 py-2">{gasto.fechaGasto}</td>
              <td className="px-3 py-2">{gasto.estadoPago}</td>
              <td className="flex justify-end gap-2 px-3 py-2">
                {gasto.ordenId ? (
                  <Button tamano="sm" variante="contorno" onClick={() => onVerRentabilidad(gasto.ordenId as string)}>
                    Rentabilidad
                  </Button>
                ) : null}
                {gasto.estadoPago === 'pendiente' ? (
                  <>
                    <Button tamano="sm" variante="contorno" onClick={() => onCambiarEstado(gasto, 'pagado')}>Marcar pagado</Button>
                    <Button tamano="sm" variante="contorno" onClick={() => onCambiarEstado(gasto, 'cancelado')}>Cancelar</Button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
