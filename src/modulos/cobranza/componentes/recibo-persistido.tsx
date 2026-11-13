'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { ReciboPagoPersistido } from '@/modulos/cobranza/tipos/historial';
import { imprimirReciboPago } from '@/modulos/cobranza/utilidades/imprimir-recibo';

export function ReciboPersistido({ recibo }: { recibo: ReciboPagoPersistido }) {
  const [error, setError] = useState(false);
  const marca = recibo.marcaDocumento;
  const campos: [string, string][] = [
    ['Cliente', recibo.clienteNombre], ['Cuenta AR', recibo.referenciaInterna], ['Orden', recibo.folioOrden],
    ['Fecha del pago', new Date(recibo.fecha).toLocaleString('es-MX')], ['Método', recibo.metodoPago.replaceAll('_', ' ')],
    ['Importe pagado', formatearMoneda(recibo.montoPagado, recibo.monedaPago)], ['Moneda de pago', recibo.monedaPago],
    ['Tipo de cambio del pago (MXN)', String(recibo.tipoCambioPago)],
    ['Moneda de la cuenta', recibo.monedaCuenta],
    ['Aplicado a la cuenta', formatearMoneda(recibo.montoAplicadoAr, recibo.monedaCuenta)],
    ['Sobrepago', formatearMoneda(recibo.montoSobrepagoAr, recibo.monedaCuenta)],
    ['Crédito al monedero (MXN)', recibo.creditoMonederoMxn === null ? 'Sin crédito por sobrepago' : formatearMoneda(recibo.creditoMonederoMxn, 'MXN')],
    ['Total del documento', formatearMoneda(recibo.totalDocumento, recibo.monedaCuenta)],
    ['Saldo actual de la cuenta', formatearMoneda(recibo.saldoActualCuenta, recibo.monedaCuenta)],
    ['Factura o remisión', recibo.folioFacturaRemision ?? 'Sin folio'],
    ['Referencia', recibo.referenciaBancaria ?? 'Sin referencia'],
    ['Cuenta bancaria', recibo.cuentaBancaria ? `${recibo.cuentaBancaria.banco} ${recibo.cuentaBancaria.numeroCuentaEnmascarado} · ${recibo.cuentaBancaria.moneda}` : 'Sin cuenta bancaria asociada'],
  ];
  if (recibo.notas) campos.push(['Notas', recibo.notas]);
  return <section
    data-testid="recibo-persistido"
    className="grid gap-4 rounded-lg border border-borde border-t-4 bg-superficie p-4"
    style={{ borderTopColor: marca.colorAcento }}
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">Recibo {recibo.folioRecibo}</h2>
        {marca.razonSocial || marca.nombre ? <p className="text-xs text-texto-secundario">{marca.razonSocial || marca.nombre}{marca.rfc ? ` · RFC ${marca.rfc}` : ''}</p> : null}
      </div>
      <Button variante="contorno" onClick={() => { setError(false); void imprimirReciboPago(recibo, marca).catch(() => setError(true)); }}>Imprimir recibo</Button>
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">{campos.map(([titulo, valor]) => <div key={titulo}><dt className="text-texto-secundario">{titulo}</dt><dd className="whitespace-pre-wrap break-words font-medium">{valor}</dd></div>)}</dl>
    <p className="text-sm text-texto-secundario">El saldo actual incluye los movimientos posteriores a este pago.</p>
    {error && <p role="alert" className="text-peligro-texto">No se pudo abrir la impresión. Vuelve a intentarlo.</p>}
  </section>;
}
