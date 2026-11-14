'use client';

import {
  MARCA_DOCUMENTO_NEUTRA,
  type MarcaDocumento,
} from '@/compartido/tipos/impresion';

/**
 * Impresión de documentos de negocio (orden de servicio, notas, recibos).
 *
 * El documento se compone como HTML propio y se imprime en un iframe aislado:
 * así la salida contiene solo el documento —con logo, color y pie de la
 * empresa— y nunca la barra lateral, el encabezado ni los modales del ERP.
 */

export type { MarcaDocumento };
export { MARCA_DOCUMENTO_NEUTRA };

const ACENTO_POR_DEFECTO = '#1D4ED8';
const COLOR_VALIDO = /^#[0-9a-f]{3,8}$/i;

/** Escapa texto para interpolarlo en HTML sin permitir marcado. */
export function escaparHtml(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Solo acepta un color CSS hexadecimal; cualquier otra cosa cae al acento base. */
export function normalizarColorAcento(valor: string | null | undefined): string {
  return typeof valor === 'string' && COLOR_VALIDO.test(valor) ? valor : ACENTO_POR_DEFECTO;
}

export interface DocumentoImpresion {
  /** Título del documento (pestaña y encabezado del navegador). */
  titulo: string;
  /** Folio grande de la esquina superior derecha. */
  folio: string;
  /** Tipo de documento: «Orden de servicio», «Nota de entrega», … */
  etiqueta: string;
  /** Pastilla de estado opcional. */
  estado?: string | null;
  /** Líneas pequeñas bajo el folio (fechas, compromiso, …). */
  meta?: readonly string[];
  marca: MarcaDocumento | null;
  /** Cuerpo del documento ya compuesto en HTML. */
  cuerpoHtml: string;
  /** Pie de página; si falta se usa el de la empresa. */
  piePagina?: string | null;
}

/**
 * Compone el HTML completo del documento con la identidad de la empresa.
 * Es una función pura para poder probarla sin navegador.
 */
export function construirHtmlImpresion(documento: DocumentoImpresion): string {
  const marca = documento.marca;
  const acento = normalizarColorAcento(marca?.colorAcento);
  const nombre = marca?.razonSocial || marca?.nombre || 'Orden de servicio';
  const pie = documento.piePagina ?? marca?.textoPiePagina ?? marca?.razonSocial ?? '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escaparHtml(documento.titulo)}</title>
<style>
  :root { --acento: ${acento}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; }
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
  h3 { margin: 0 0 4px; font-size: 12px; color: #0f172a; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .dato { font-size: 11px; color: #334155; line-height: 1.5; }
  .dato b { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  thead th { background: #f1f5f9; color: #0f172a; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: "Courier New", monospace; }
  .item { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .item p { margin: 0; }
  .tenue { color: #64748b; font-size: 11px; }
  .lista { margin: 0; padding-left: 16px; }
  .totales { display: flex; justify-content: flex-end; margin-top: 10px; }
  .totales table { width: 300px; }
  .totales th { font-weight: 400; color: #475569; border: 0; }
  .totales td { border: 0; }
  .totales .total th, .totales .total td { font-size: 14px; font-weight: 700; color: var(--acento); border-top: 2px solid var(--acento); }
  .resumen { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
  .resumen div { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; }
  .resumen dt { font-size: 10px; text-transform: uppercase; color: #64748b; }
  .resumen dd { margin: 2px 0 0; font-weight: 700; color: #0f172a; }
  footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; text-align: center; }
  @page { size: A4; margin: 12mm; }
</style>
</head>
<body>
  <div class="hoja">
    <div class="barra"></div>
    <header>
      <div class="empresa">
        ${marca?.logoUrl ? `<img src="${escaparHtml(marca.logoUrl)}" alt="${escaparHtml(marca.nombre)}" />` : ''}
        <div>
          <strong>${escaparHtml(nombre)}</strong>
          ${marca?.rfc ? `<span>RFC: ${escaparHtml(marca.rfc)}</span>` : ''}
          ${marca?.direccion ? `<span>${escaparHtml(marca.direccion)}</span>` : ''}
          ${marca?.telefono ? `<span>Tel: ${escaparHtml(marca.telefono)}</span>` : ''}
          ${marca?.email ? `<span>${escaparHtml(marca.email)}</span>` : ''}
        </div>
      </div>
      <div class="folio">
        <strong>${escaparHtml(documento.folio)}</strong>
        <span>${escaparHtml(documento.etiqueta)}</span>
        ${documento.estado ? `<span class="estado">${escaparHtml(documento.estado)}</span>` : ''}
        ${(documento.meta ?? []).map((linea) => `<span>${escaparHtml(linea)}</span>`).join('')}
      </div>
    </header>
    ${documento.cuerpoHtml}
    ${pie ? `<footer>${escaparHtml(pie)}</footer>` : ''}
  </div>
</body>
</html>`;
}

/**
 * Imprime el HTML en un iframe aislado. Espera fuentes e imágenes para que el
 * logo salga en la primera pasada y desmonta el iframe al terminar.
 */
export function imprimirHtmlAislado(html: string, titulo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Chrome toma el nombre del «Guardar como PDF» del título del documento
    // superior, no del iframe. Sin esto el archivo salía como «CC Manufacturing
    // Group» (Obs. cliente 2026-11-14). Se restaura al terminar.
    const tituloOriginal = document.title;
    document.title = titulo;

    const marco = document.createElement('iframe');
    marco.title = titulo;
    marco.setAttribute('aria-hidden', 'true');
    // Fuera del viewport pero con tamaño real: algunos navegadores omiten el
    // contenido de iframes con 0×0 al preparar la impresión.
    marco.style.cssText = 'position:fixed;top:0;left:-10000px;width:1024px;height:768px;border:0;visibility:hidden';
    document.body.appendChild(marco);

    const ventana = marco.contentWindow;
    const destino = marco.contentDocument;
    if (!ventana || !destino) {
      document.title = tituloOriginal;
      marco.remove();
      reject(new Error('Impresión no disponible'));
      return;
    }

    let impreso = false;
    const limpiar = () => {
      window.clearTimeout(respaldo);
      document.title = tituloOriginal;
      marco.remove();
    };
    const respaldo = window.setTimeout(limpiar, 120_000);

    const imprimir = () => {
      if (impreso) return;
      impreso = true;
      try {
        ventana.focus();
        ventana.print();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('No se pudo imprimir'));
      } finally {
        // Da tiempo al diálogo del navegador antes de retirar el iframe.
        window.setTimeout(limpiar, 60_000);
      }
    };

    ventana.addEventListener('afterprint', limpiar, { once: true });

    destino.open();
    destino.write(html);
    destino.close();

    const imagenes = Array.from(destino.images).map((imagen) => new Promise<void>((listo) => {
      if (imagen.complete) return listo();
      imagen.addEventListener('load', () => listo(), { once: true });
      imagen.addEventListener('error', () => listo(), { once: true });
    }));

    const fuentes = destino.fonts?.ready ?? Promise.resolve();
    void Promise.all([...imagenes, fuentes]).then(imprimir);
  });
}
