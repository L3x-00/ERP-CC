'use client';

import { useRef, useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { ReciboPagoPersistido } from '@/modulos/cobranza/tipos/historial';

/** Copia únicamente el recibo a un documento de impresión, sin interpolar HTML. */
export async function imprimirRecibo(elemento: HTMLElement): Promise<void> {
  const marco = document.createElement('iframe');
  marco.title = 'Impresión de recibo';
  marco.setAttribute('aria-hidden', 'true');
  marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0';
  document.body.appendChild(marco);
  const destino = marco.contentDocument;
  const ventana = marco.contentWindow;
  if (!destino || !ventana) { marco.remove(); throw new Error('Impresión no disponible'); }
  const estilo = destino.createElement('style');
  estilo.textContent = 'body{font:14px Arial,sans-serif;color:#111;padding:24px}h2{font-size:24px}dl{display:grid;grid-template-columns:1fr 1fr;gap:16px}dt{color:#444}dd{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}button,[role=alert]{display:none}@page{margin:15mm}';
  destino.head.appendChild(estilo);
  destino.title = 'Recibo de pago';
  destino.body.appendChild(elemento.cloneNode(true));
  ventana.addEventListener('afterprint', () => marco.remove(), { once: true });
  try { ventana.focus(); ventana.print(); } catch (error) { marco.remove(); throw error; }
  // Respaldo para navegadores que no emiten afterprint en subdocumentos.
  window.setTimeout(() => marco.remove(), 120_000);
}

export function ReciboPersistido({ recibo }: { recibo: ReciboPagoPersistido }) {
  const elemento = useRef<HTMLElement>(null);
  const [error, setError] = useState(false);
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
  return <section ref={elemento} data-testid="recibo-persistido" className="grid gap-4 rounded-lg border border-borde bg-superficie p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Recibo {recibo.folioRecibo}</h2>
      <Button variante="contorno" onClick={() => { setError(false); if (elemento.current) void imprimirRecibo(elemento.current).catch(() => setError(true)); }}>Imprimir recibo</Button></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">{campos.map(([titulo, valor]) => <div key={titulo}><dt className="text-texto-secundario">{titulo}</dt><dd className="whitespace-pre-wrap break-words font-medium">{valor}</dd></div>)}</dl>
    <p className="text-sm text-texto-secundario">El saldo actual incluye los movimientos posteriores a este pago.</p>
    {error && <p role="alert" className="text-peligro-texto">No se pudo abrir la impresión. Vuelve a intentarlo.</p>}
  </section>;
}
