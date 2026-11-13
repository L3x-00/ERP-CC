'use client';

import {
  construirHtmlImpresion,
  escaparHtml,
  imprimirHtmlAislado,
  type MarcaDocumento,
} from '@/compartido/utilidades/impresion-documento';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { ReciboPagoPersistido } from '@/modulos/cobranza/tipos/historial';

function fechaHora(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
}

function fila(concepto: string, valor: string, clase = ''): string {
  return `<tr><td>${escaparHtml(concepto)}</td><td class="num ${clase}">${escaparHtml(valor)}</td></tr>`;
}

/**
 * Recibo de pago con la identidad documental de la empresa. Se imprime aislado
 * para que la salida no incluya el panel de Cobros ni el diálogo del ERP.
 */
export function construirHtmlReciboPago(
  recibo: ReciboPagoPersistido,
  marca: MarcaDocumento | null,
): string {
  const aplicado = formatearMoneda(recibo.montoAplicadoAr, recibo.monedaCuenta);
  const sobrepago = formatearMoneda(recibo.montoSobrepagoAr, recibo.monedaCuenta);
  const credito = recibo.creditoMonederoMxn === null
    ? 'Sin crédito por sobrepago'
    : formatearMoneda(recibo.creditoMonederoMxn, 'MXN');
  const cuentaBancaria = recibo.cuentaBancaria
    ? `${recibo.cuentaBancaria.banco} ${recibo.cuentaBancaria.numeroCuentaEnmascarado} · ${recibo.cuentaBancaria.moneda}`
    : 'Sin cuenta bancaria asociada';

  const cuerpo = `
    <section class="grid">
      <div>
        <h2>Cliente</h2>
        <div class="dato"><b>${escaparHtml(recibo.clienteNombre)}</b></div>
        <div class="dato">Cuenta AR: ${escaparHtml(recibo.referenciaInterna)}</div>
        <div class="dato">Orden: ${escaparHtml(recibo.folioOrden)}</div>
        <div class="dato">Factura o remisión: ${escaparHtml(recibo.folioFacturaRemision ?? 'Sin folio')}</div>
      </div>
      <div>
        <h2>Pago</h2>
        <div class="dato">Fecha: ${escaparHtml(fechaHora(recibo.fecha))}</div>
        <div class="dato">Método: ${escaparHtml(recibo.metodoPago.replaceAll('_', ' '))}</div>
        <div class="dato">Referencia: ${escaparHtml(recibo.referenciaBancaria ?? 'Sin referencia')}</div>
        <div class="dato">Cuenta bancaria: ${escaparHtml(cuentaBancaria)}</div>
      </div>
    </section>

    <section>
      <h2>Importes</h2>
      <table>
        <thead><tr><th>Concepto</th><th class="num">Valor</th></tr></thead>
        <tbody>
          ${fila('Importe pagado', formatearMoneda(recibo.montoPagado, recibo.monedaPago))}
          ${fila('Moneda de pago', recibo.monedaPago)}
          ${fila('Tipo de cambio del pago (MXN)', String(recibo.tipoCambioPago))}
          ${fila('Moneda de la cuenta', recibo.monedaCuenta)}
          ${fila('Aplicado a la cuenta', aplicado)}
          ${fila('Sobrepago', sobrepago)}
          ${fila('Crédito al monedero (MXN)', credito)}
          ${fila('Total del documento', formatearMoneda(recibo.totalDocumento, recibo.monedaCuenta))}
          ${fila('Saldo actual de la cuenta', formatearMoneda(recibo.saldoActualCuenta, recibo.monedaCuenta), 'total')}
        </tbody>
      </table>
    </section>

    ${recibo.notas ? `<section><h2>Notas</h2><p class="dato">${escaparHtml(recibo.notas)}</p></section>` : ''}
    <p class="tenue">El saldo actual incluye los movimientos posteriores a este pago.</p>`;

  return construirHtmlImpresion({
    titulo: `Recibo de pago ${recibo.folioRecibo}`,
    folio: recibo.folioRecibo,
    etiqueta: 'Recibo de pago',
    estado: recibo.estadoActualCuenta === 'pagado' ? 'Pagado' : null,
    meta: [`Fecha: ${fechaHora(recibo.fecha)}`, `Cuenta AR: ${recibo.referenciaInterna}`],
    marca,
    cuerpoHtml: cuerpo,
  });
}

export function imprimirReciboPago(
  recibo: ReciboPagoPersistido,
  marca: MarcaDocumento | null,
): Promise<void> {
  return imprimirHtmlAislado(
    construirHtmlReciboPago(recibo, marca),
    `Impresión del recibo ${recibo.folioRecibo}`,
  );
}
