'use client';

import { Button } from '@/compartido/componentes/ui/button';
import type { CuentaCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';

function formatoMoneda(valor: number, moneda: string): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda }).format(valor);
}

export interface TablaCuentasPorCobrarProps {
  cuentas: readonly CuentaCartera[];
  cuentaSeleccionadaId: string | null;
  onSeleccionar: (cuentaId: string) => void;
}

export function TablaCuentasPorCobrar({
  cuentas,
  cuentaSeleccionadaId,
  onSeleccionar,
}: TablaCuentasPorCobrarProps) {
  if (cuentas.length === 0) {
    return <p className="rounded-base border border-dashed border-foreground/20 p-6 text-sm text-foreground/65">No hay cuentas por cobrar con los filtros actuales.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-base border border-foreground/15">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-foreground/5 text-xs text-foreground/70">
          <tr>
            <th className="px-3 py-2">Orden</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Vencimiento</th>
            <th className="px-3 py-2 text-right">Monto</th>
            <th className="px-3 py-2 text-right">Saldo</th>
            <th className="px-3 py-2">Producción</th>
            <th className="px-3 py-2">Pago</th>
            <th className="px-3 py-2"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {cuentas.map((cuenta) => {
            const seleccionada = cuenta.id === cuentaSeleccionadaId;
            return (
              <tr key={cuenta.id} className={seleccionada ? 'bg-primario/10' : 'border-t border-foreground/10'}>
                <td className="px-3 py-2 font-medium">{cuenta.folioOrden}</td>
                <td className="px-3 py-2">{cuenta.clienteNombre}</td>
                <td className="px-3 py-2">{new Intl.DateTimeFormat('es-MX').format(new Date(cuenta.fechaVencimiento))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatoMoneda(cuenta.montoTotal, cuenta.moneda)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatoMoneda(cuenta.saldoPendiente, cuenta.moneda)}</td>
                <td className="px-3 py-2">{cuenta.estadoProduccion}</td>
                <td className="px-3 py-2">{cuenta.estado}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    tamano="sm"
                    variante={seleccionada ? 'secundario' : 'contorno'}
                    onClick={() => onSeleccionar(cuenta.id)}
                  >
                    Cobrar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
