'use client';

import type { DocumentoOrden } from '@/modulos/ordenes/servicios/documento-orden-servicio';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  en_proceso: 'En proceso',
  pausada: 'Pausada',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

function escapar(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fecha(valor: string): string {
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? valor : fecha.toLocaleDateString('es-MX');
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

/**
 * Genera la Orden de Servicio en un documento de impresión aislado. No imprime
 * el modal ni el resto del ERP: el iframe contiene solo la orden, con el color
 * de acento y el pie de página configurados por la empresa.
 */
export function construirHtmlDocumentoOrden(documento: DocumentoOrden): string {
  const acento = /^#[0-9a-f]{3,8}$/i.test(documento.empresa.colorAcento)
    ? documento.empresa.colorAcento
    : '#1D4ED8';
  const e = documento.empresa;

  const filasPartidas = documento.partidas.map((partida) => `
    <tr>
      <td class="mono">${escapar(partida.codigoPieza)}</td>
      <td>${escapar(partida.descripcion ?? '—')}</td>
      <td>${escapar([partida.areaTrabajoCodigo, partida.procesos.join(', ')].filter(Boolean).join(' · ') || '—')}</td>
      <td class="num">${numero(partida.cantidadSolicitada)} ${escapar(partida.unidadMedida)}</td>
      <td class="num">${numero(partida.cantidadProducida)}</td>
      <td class="num">${numero(partida.tiempoRealMinutos / 60)} / ${numero(partida.tiempoEstimadoMinutos / 60)}</td>
    </tr>`).join('');

  const filasLineas = documento.lineas.map((linea) => `
    <tr>
      <td>${escapar(linea.descripcion)}${linea.esDescuento ? ' (descuento)' : ''}</td>
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

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Orden de servicio ${escapar(documento.orden.folio)}</title>
<style>
  :root { --acento: ${acento}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  .hoja { padding: 4mm 2mm; }
  .barra { height: 7px; background: var(--acento); border-radius: 4px; }
  header { display: flex; justify-content: space-between; gap: 24px; padding: 16px 0 12px; border-bottom: 2px solid var(--acento); }
  .empresa { display: flex; gap: 12px; align-items: flex-start; }
  .empresa img { max-height: 54px; max-width: 140px; object-fit: contain; }
  .empresa strong { display: block; font-size: 15px; color: var(--acento); }
  .empresa span { display: block; font-size: 11px; color: #475569; line-height: 1.45; }
  .folio { text-align: right; }
  .folio strong { font-family: "Courier New", monospace; font-size: 18px; }
  .folio span { display: block; font-size: 11px; color: #475569; }
  .folio .estado { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 999px; background: var(--acento); color: #fff; font-weight: 700; }
  section { margin-top: 14px; }
  h2 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--acento); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .dato { font-size: 11px; color: #334155; line-height: 1.5; }
  .dato b { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  thead th { background: color-mix(in srgb, var(--acento) 10%, #fff); color: #0f172a; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: "Courier New", monospace; }
  .totales { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totales table { width: 300px; }
  .totales th { font-weight: 400; color: #475569; border: 0; }
  .totales td { border: 0; }
  .totales .total th, .totales .total td { font-size: 14px; font-weight: 700; color: var(--acento); border-top: 2px solid var(--acento); }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; text-align: center; }
  @page { size: A4; margin: 12mm; }
</style>
</head>
<body>
  <div class="hoja">
    <div class="barra"></div>
    <header>
      <div class="empresa">
        ${e.logoUrl ? `<img src="${escapar(e.logoUrl)}" alt="${escapar(e.nombre)}" />` : ''}
        <div>
          <strong>${escapar(e.razonSocial || e.nombre)}</strong>
          ${e.rfc ? `<span>RFC: ${escapar(e.rfc)}</span>` : ''}
          ${e.direccion ? `<span>${escapar(e.direccion)}</span>` : ''}
          ${e.telefono ? `<span>Tel: ${escapar(e.telefono)}</span>` : ''}
          ${e.email ? `<span>${escapar(e.email)}</span>` : ''}
        </div>
      </div>
      <div class="folio">
        <strong>${escapar(documento.orden.folio)}</strong>
        <span>Orden de servicio</span>
        <span class="estado">${escapar(ETIQUETA_ESTADO[documento.orden.estado] ?? documento.orden.estado)}${documento.orden.esInterna ? ' · TI' : ''}</span>
        <span>Creada: ${escapar(fecha(documento.orden.creadoEn))}</span>
        <span>Compromiso: ${escapar(fecha(documento.orden.fechaCompromiso))}</span>
      </div>
    </header>

    <section class="grid">
      <div>
        <h2>Cliente</h2>
        <div class="dato"><b>${escapar(documento.cliente?.razonSocial ?? 'Sin cliente registrado')}</b></div>
        ${documento.cliente?.rfc ? `<div class="dato">RFC: ${escapar(documento.cliente.rfc)}</div>` : ''}
        ${documento.orden.nombreContacto ? `<div class="dato">Contacto: ${escapar(documento.orden.nombreContacto)}</div>` : ''}
      </div>
      <div>
        <h2>Referencias</h2>
        <div class="dato">Cotización: ${escapar(documento.orden.folioCotizacion ?? 'manual')}</div>
        <div class="dato">PO del cliente: ${escapar(documento.orden.poCliente ?? 'Sin PO')}</div>
        ${documento.orden.notas ? `<div class="dato">Notas: ${escapar(documento.orden.notas)}</div>` : ''}
      </div>
    </section>

    <section>
      <h2>Partidas a fabricar</h2>
      <table>
        <thead><tr><th>Código</th><th>Descripción</th><th>Área / procesos</th><th class="num">Solicitado</th><th class="num">Producido</th><th class="num">Horas real / est.</th></tr></thead>
        <tbody>${filasPartidas || '<tr><td colspan="6">Sin partidas registradas</td></tr>'}</tbody>
      </table>
    </section>

    ${documento.lineas.length > 0 ? `
    <section>
      <h2>Detalle comercial de la cotización</h2>
      <table>
        <thead><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Importe</th></tr></thead>
        <tbody>${filasLineas}</tbody>
      </table>
      ${totales}
    </section>` : ''}

    <footer>${escapar(e.textoPiePagina || e.razonSocial || e.nombre)}</footer>
  </div>
</body>
</html>`;
}

/** Imprime la orden en un iframe aislado para no capturar el modal ni el resto de la app. */
export function imprimirDocumentoOrden(documento: DocumentoOrden): Promise<void> {
  return new Promise((resolve, reject) => {
    const marco = document.createElement('iframe');
    marco.title = `Impresión de la orden ${documento.orden.folio}`;
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0';
    document.body.appendChild(marco);

    const limpiar = () => marco.remove();
    const ventana = marco.contentWindow;
    const destino = marco.contentDocument;
    if (!ventana || !destino) {
      limpiar();
      reject(new Error('Impresión no disponible'));
      return;
    }

    destino.open();
    destino.write(construirHtmlDocumentoOrden(documento));
    destino.close();

    const imprimir = () => {
      try {
        ventana.focus();
        ventana.print();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('No se pudo imprimir'));
      } finally {
        window.setTimeout(limpiar, 1000);
      }
    };

    // Espera las imágenes (logo) sin bloquear si no cargan.
    const esperar = Promise.all(
      Array.from(destino.images).map((imagen) => new Promise<void>((listo) => {
        if (imagen.complete) return listo();
        imagen.addEventListener('load', () => listo(), { once: true });
        imagen.addEventListener('error', () => listo(), { once: true });
      })),
    );
    void esperar.then(imprimir);
  });
}
