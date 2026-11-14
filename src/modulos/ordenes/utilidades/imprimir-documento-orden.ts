'use client';

import {
  construirHtmlImpresion,
  escaparHtml,
  imprimirHtmlAislado,
  type MarcaDocumento,
} from '@/compartido/utilidades/impresion-documento';
import type { DocumentoOrden } from '@/modulos/ordenes/servicios/documento-orden-servicio';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function fecha(valor: string): string {
  const convertida = new Date(valor);
  return Number.isNaN(convertida.getTime()) ? valor : convertida.toLocaleDateString('es-MX');
}

function dinero(valor: number, moneda: 'MXN' | 'USD'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(valor);
}

function numero(valor: number, decimales = 2): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

function marcaDeEmpresa(documento: DocumentoOrden): MarcaDocumento {
  return {
    nombre: documento.empresa.nombre,
    razonSocial: documento.empresa.razonSocial,
    rfc: documento.empresa.rfc,
    direccion: documento.empresa.direccion,
    telefono: documento.empresa.telefono,
    email: documento.empresa.email,
    logoUrl: documento.empresa.logoUrl,
    colorAcento: documento.empresa.colorAcento,
    textoPiePagina: documento.empresa.textoPiePagina,
  };
}

/**
 * Genera la Orden de Servicio en un documento de impresión aislado. No imprime
 * el modal ni el resto del ERP: el iframe contiene solo la orden, con el color
 * de acento y el pie de página configurados por la empresa.
 */
export function construirHtmlDocumentoOrden(documento: DocumentoOrden): string {
  const filasPartidas = documento.partidas.map((partida) => `
    <tr>
      <td class="mono">${escaparHtml(partida.codigoPieza)}</td>
      <td>${escaparHtml(partida.descripcion ?? '—')}</td>
      <td>${escaparHtml([partida.areaTrabajoCodigo, partida.procesos.join(', ')].filter(Boolean).join(' · ') || '—')}</td>
      <td class="num">${numero(partida.cantidadSolicitada)} ${escaparHtml(partida.unidadMedida)}</td>
      <td class="num">${numero(partida.cantidadProducida)}</td>
      <td class="num">${numero(partida.tiempoRealMinutos / 60)} / ${numero(partida.tiempoEstimadoMinutos / 60)}</td>
    </tr>`).join('');

  const filasLineas = documento.lineas.map((linea) => `
    <tr>
      <td>${escaparHtml(linea.descripcion)}${linea.esDescuento ? ' (descuento)' : ''}</td>
      <td class="num">${numero(linea.cantidad)}</td>
      <td class="num">${dinero(linea.precioUnitario, documento.totales.moneda)}</td>
      <td class="num">${linea.esDescuento ? '-' : ''}${dinero(linea.cantidad * linea.precioUnitario, documento.totales.moneda)}</td>
    </tr>`).join('');

  const totales = documento.lineas.length > 0 ? `
    <section class="totales">
      <table>
        <tr><th>Subtotal líneas</th><td class="num">${dinero(documento.totales.subtotal + documento.totales.descuento, documento.totales.moneda)}</td></tr>
        <tr><th>Descuento</th><td class="num">-${dinero(documento.totales.descuento, documento.totales.moneda)}</td></tr>
        <tr><th>IVA (${numero(documento.totales.ivaPorcentaje, 0)}%)</th><td class="num">${dinero(documento.totales.iva, documento.totales.moneda)}</td></tr>
        <tr class="total"><th>Total</th><td class="num">${dinero(documento.totales.total, documento.totales.moneda)}</td></tr>
      </table>
    </section>` : '';

  const detalleComercial = documento.lineas.length > 0 ? `
    <section>
      <h2>Detalle comercial de la cotización</h2>
      <table>
        <thead><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>${filasLineas}</tbody>
      </table>
      ${totales}
    </section>` : '';

  const cuerpo = `
    <section class="grid">
      <div>
        <h2>Cliente</h2>
        <div class="dato"><b>${escaparHtml(documento.cliente?.razonSocial ?? 'Sin cliente registrado')}</b></div>
        ${documento.cliente?.rfc ? `<div class="dato">RFC: ${escaparHtml(documento.cliente.rfc)}</div>` : ''}
        ${documento.orden.nombreContacto ? `<div class="dato">Contacto: ${escaparHtml(documento.orden.nombreContacto)}</div>` : ''}
      </div>
      <div>
        <h2>Referencias</h2>
        <div class="dato">Cotización: ${escaparHtml(documento.orden.folioCotizacion ?? 'manual')}</div>
        <div class="dato">PO del cliente: ${escaparHtml(documento.orden.poCliente ?? 'Sin PO')}</div>
        ${documento.orden.notas ? `<div class="dato">Notas: ${escaparHtml(documento.orden.notas)}</div>` : ''}
      </div>
    </section>

    <section>
      <h2>Partidas a fabricar</h2>
      <table>
        <thead><tr><th>Código</th><th>Descripción</th><th>Área / procesos</th><th class="num">Solicitado</th><th class="num">Producido</th><th class="num">Horas real / est.</th></tr></thead>
        <tbody>${filasPartidas || '<tr><td colspan="6">Sin partidas registradas</td></tr>'}</tbody>
      </table>
    </section>

    ${detalleComercial}`;

  return construirHtmlImpresion({
    titulo: `Orden de servicio ${documento.orden.folio}`,
    folio: documento.orden.folio,
    etiqueta: 'Orden de servicio',
    estado: `${ETIQUETA_ESTADO[documento.orden.estado] ?? documento.orden.estado}${documento.orden.esInterna ? ' · TI' : ''}`,
    meta: [
      `Creada: ${fecha(documento.orden.creadoEn)}`,
      `Compromiso: ${fecha(documento.orden.fechaCompromiso)}`,
    ],
    marca: marcaDeEmpresa(documento),
    cuerpoHtml: cuerpo,
  });
}

/** Imprime la orden en un iframe aislado para no capturar el modal ni el resto de la app. */
export function imprimirDocumentoOrden(documento: DocumentoOrden): Promise<void> {
  return imprimirHtmlAislado(
    construirHtmlDocumentoOrden(documento),
    `Orden de servicio ${documento.orden.folio}`,
  );
}
