import type { ReactNode } from 'react';

import type { TotalesSnapshot } from '@/modulos/ordenes/tipos/ficha-orden';

export function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-borde bg-superficie-2 p-3">
      <p className="text-xs text-texto-secundario">{titulo}</p>
      <div className="mt-1 text-sm font-semibold text-texto-primario">{children}</div>
    </div>
  );
}

export function Totales({ totales }: { totales: TotalesSnapshot | null }) {
  if (!totales || totales.total === null) {
    return <p className="text-sm text-texto-secundario">Sin totales comerciales en el snapshot.</p>;
  }
  const moneda = totales.moneda ?? 'MXN';
  const formato = (valor: number | null) =>
    valor === null ? '—' : `${moneda} ${valor.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  return (
    <dl className="grid gap-2 sm:grid-cols-4">
      <Tarjeta titulo="Subtotal">{formato(totales.subtotal)}</Tarjeta>
      <Tarjeta titulo="Descuento">{formato(totales.descuento)}</Tarjeta>
      <Tarjeta titulo="IVA">{formato(totales.iva)}</Tarjeta>
      <Tarjeta titulo="Total">{formato(totales.total)}</Tarjeta>
    </dl>
  );
}
