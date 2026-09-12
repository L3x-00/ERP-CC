'use client';

import { Button } from '@/compartido/componentes/ui/button';

export interface ReciboPago {
  folio: string;
  cliente: string;
  montoAplicado: number;
  moneda: string;
  metodo: string;
  saldoRestante: number;
}

export function ReciboPagoVista({ recibo }: { recibo: ReciboPago | null }) {
  if (!recibo) return null;

  const monto = new Intl.NumberFormat('es-MX', { style: 'currency', currency: recibo.moneda });
  return (
    <section className="rounded-lg border border-borde bg-superficie p-5 shadow-sm print:border-0 print:shadow-none" data-testid="recibo-pago">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-texto-secundario">Recibo de pago</p>
          <h2 className="text-xl font-bold">{recibo.folio}</h2>
        </div>
        <Button variante="contorno" tamano="sm" className="print:hidden" onClick={() => window.print()}>Imprimir recibo</Button>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-texto-secundario">Cliente</dt><dd className="font-medium">{recibo.cliente}</dd></div>
        <div><dt className="text-texto-secundario">Método</dt><dd className="font-medium">{recibo.metodo}</dd></div>
        <div><dt className="text-texto-secundario">Abono aplicado</dt><dd className="font-medium tabular-nums">{monto.format(recibo.montoAplicado)}</dd></div>
        <div><dt className="text-texto-secundario">Saldo restante</dt><dd className="font-medium tabular-nums">{monto.format(recibo.saldoRestante)}</dd></div>
      </dl>
    </section>
  );
}
