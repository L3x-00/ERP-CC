'use client';

import {
  construirHtmlImpresion,
  escaparHtml,
  imprimirHtmlAislado,
  type MarcaDocumento,
} from '@/compartido/utilidades/impresion-documento';
import type {
  HojaTrabajoOrden,
  TotalesSnapshot,
} from '@/modulos/ordenes/tipos/ficha-orden';
import { claveValor } from '@/modulos/ordenes/utilidades/formato-ficha';

function dinero(valor: number | null, moneda: string): string {
  if (valor === null) return '—';
  return `${moneda} ${new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)}`;
}

function bloqueTotales(totales: TotalesSnapshot | null): string {
  if (!totales || totales.total === null) return '';
  const moneda = totales.moneda ?? 'MXN';
  return `<section>
    <h2>Totales</h2>
    <dl class="resumen">
      <div><dt>Subtotal</dt><dd>${escaparHtml(dinero(totales.subtotal, moneda))}</dd></div>
      <div><dt>Descuento</dt><dd>${escaparHtml(dinero(totales.descuento, moneda))}</dd></div>
      <div><dt>IVA</dt><dd>${escaparHtml(dinero(totales.iva, moneda))}</dd></div>
      <div><dt>Total</dt><dd>${escaparHtml(dinero(totales.total, moneda))}</dd></div>
    </dl>
  </section>`;
}

/**
 * Compone la hoja de trabajo de una orden como documento imprimible: solo los
 * datos de fabricación (sin economía salvo los totales ya autorizados) y la
 * identidad de la empresa.
 */
export function construirHtmlHojaTrabajo(entrada: {
  hoja: HojaTrabajoOrden;
  marca: MarcaDocumento | null;
  totales?: TotalesSnapshot | null;
  compromiso?: string | null;
}): string {
  const { hoja, marca } = entrada;
  const totales = entrada.totales ?? null;
  const items = hoja.items.map((item) => `
    <div class="item">
      <p><strong>${escaparHtml(item.codigoItem)} · ${escaparHtml(item.descripcion ?? '')}</strong></p>
      <p class="tenue">${escaparHtml(claveValor(item.cantidad))} · ${escaparHtml(item.material ?? 'sin material')} · ${escaparHtml(item.espesor ?? 'sin espesor')}</p>
      ${item.procesos.length > 0 ? `<p class="tenue">${escaparHtml(item.procesos.join(' → '))}</p>` : ''}
      ${item.observaciones ? `<p class="tenue">Observaciones: ${escaparHtml(item.observaciones)}</p>` : ''}
    </div>`).join('');

  const archivos = hoja.archivos.length > 0 ? `
    <section>
      <h3>Archivos</h3>
      <ul class="lista tenue">
        ${hoja.archivos.map((archivo) => `<li>${escaparHtml(archivo.nombreOriginal ?? archivo.nombreErp ?? 'Archivo sin nombre')} · ${escaparHtml(archivo.asociadoA)}</li>`).join('')}
      </ul>
    </section>` : '';

  const observaciones = hoja.observacionesOrden
    ? `<p class="tenue">Observaciones de la orden: ${escaparHtml(hoja.observacionesOrden)}</p>`
    : '';

  const cuerpo = `
    <section class="grid">
      <div>
        <h2>Cliente</h2>
        <div class="dato"><b>${escaparHtml(hoja.clienteNombre ?? 'Sin cliente registrado')}</b></div>
      </div>
      <div>
        <h2>Referencias</h2>
        <div class="dato">${escaparHtml(entrada.compromiso ?? '')}</div>
      </div>
    </section>
    <section>
      <h2>Partidas a fabricar</h2>
      ${items || '<p class="tenue">Sin partidas registradas.</p>'}
      ${observaciones}
      ${archivos}
    </section>
    ${bloqueTotales(totales)}`;

  return construirHtmlImpresion({
    titulo: `Orden de servicio ${hoja.folio}`,
    folio: hoja.folio,
    etiqueta: 'Orden de servicio',
    marca,
    cuerpoHtml: cuerpo,
  });
}

/** Imprime la hoja de trabajo sin la interfaz del ERP. */
export function imprimirHojaTrabajo(entrada: Parameters<typeof construirHtmlHojaTrabajo>[0]): Promise<void> {
  return imprimirHtmlAislado(
    construirHtmlHojaTrabajo(entrada),
    `Impresión de la orden ${entrada.hoja.folio}`,
  );
}
