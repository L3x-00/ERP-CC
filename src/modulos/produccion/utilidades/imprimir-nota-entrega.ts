'use client';

import {
  construirHtmlImpresion,
  escaparHtml,
  imprimirHtmlAislado,
} from '@/compartido/utilidades/impresion-documento';
import { formatearNumero } from '@/compartido/utilidades/formatear';
import type { DocumentoNotaEntrega } from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';

function fechaDocumento(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'UTC' });
}

/**
 * Nota de entrega con la identidad documental de la empresa. Es la misma
 * composición del PDF, pero en HTML aislado para que la impresión directa no
 * herede el modal con scroll que cortaba el formato.
 */
export function construirHtmlNotaEntrega(documento: DocumentoNotaEntrega): string {
  const filas = documento.lineas.map((linea) => `
    <tr>
      <td class="mono">${escaparHtml(linea.codigoPieza)}</td>
      <td>${escaparHtml(linea.descripcion ?? '—')}</td>
      <td class="num">${formatearNumero(linea.cantidadNota)} ${escaparHtml(linea.unidadMedida)}</td>
      <td class="num">${formatearNumero(linea.entregadoAcumulado)}</td>
      <td class="num">${formatearNumero(linea.cantidadSolicitada)}</td>
    </tr>`).join('');

  const cuerpo = `
    <section class="grid">
      <div>
        <h2>Cliente</h2>
        <div class="dato"><b>${escaparHtml(documento.orden.clienteRazonSocial ?? 'Sin cliente registrado')}</b></div>
        ${documento.orden.clienteRfc ? `<div class="dato">RFC: ${escaparHtml(documento.orden.clienteRfc)}</div>` : ''}
      </div>
      <div>
        <h2>Entrega</h2>
        <div class="dato">Orden: ${escaparHtml(documento.orden.folio)}</div>
        <div class="dato">Tipo: ${documento.nota.esParcial ? 'Entrega parcial' : 'Entrega total'}</div>
        <div class="dato">Fecha: ${escaparHtml(fechaDocumento(documento.nota.creadoEn))}</div>
      </div>
    </section>

    <p class="item tenue">
      Este documento confirma las piezas entregadas. No contiene precios ni sustituye un comprobante fiscal.
    </p>

    <section>
      <h2>Piezas entregadas</h2>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th class="num">Esta nota</th>
            <th class="num">Entregado acumulado</th>
            <th class="num">Solicitado</th>
          </tr>
        </thead>
        <tbody>${filas || '<tr><td colspan="5">Sin piezas registradas</td></tr>'}</tbody>
      </table>
    </section>

    <section class="resumen">
      <div><dt>Total de esta nota</dt><dd>${formatearNumero(documento.totalNota)} pieza(s)</dd></div>
      <div><dt>Acumulado</dt><dd>${formatearNumero(documento.totalAcumulado)} de ${formatearNumero(documento.totalSolicitado)}</dd></div>
    </section>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px;">
      <div style="border-top:1px solid #152033;padding-top:6px;text-align:center;">
        Recibido por: ${escaparHtml(documento.nota.recibidoPor)}
      </div>
      <div style="border-top:1px solid #152033;padding-top:6px;text-align:center;">
        Entregado por: ${escaparHtml(documento.empresa.razonSocial || documento.empresa.nombre)}
      </div>
    </div>
    ${documento.nota.firmaClienteUrl ? '<p class="tenue" style="margin-top:8px;">Firma de conformidad registrada electrónicamente.</p>' : ''}`;

  return construirHtmlImpresion({
    titulo: `Nota de entrega ${documento.nota.folio}`,
    folio: documento.nota.folio,
    etiqueta: 'Nota de entrega',
    estado: documento.nota.esParcial ? 'Entrega parcial' : 'Entrega total',
    meta: [`Fecha: ${fechaDocumento(documento.nota.creadoEn)}`, `Orden: ${documento.orden.folio}`],
    marca: documento.marca,
    cuerpoHtml: cuerpo,
  });
}

export function imprimirNotaEntrega(documento: DocumentoNotaEntrega): Promise<void> {
  return imprimirHtmlAislado(
    construirHtmlNotaEntrega(documento),
    `Nota de entrega ${documento.nota.folio}`,
  );
}
