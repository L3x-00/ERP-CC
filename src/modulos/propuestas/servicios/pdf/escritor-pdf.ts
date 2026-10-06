import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { DocumentoPropuesta } from './documento-propuesta';

/**
 * Escritor PDF 1.4 interno mínimo (spike ADR-SII-04).
 *
 * Decisión: sin dependencias (ni `@react-pdf/renderer` ni Chromium headless).
 * Criterios del spike: sin red en runtime, determinista (mismos datos ⇒ mismos
 * bytes, por eso no embebe fecha de creación), peso de build nulo y plantilla
 * reutilizable. Si el cliente exige maquetación rica, el renderer puede
 * sustituirse detrás de `generarPdfBorrador` sin tocar datos ni flujo.
 */

type LineaPdf = {
  texto: string;
  tamano: number;
  negrita: boolean;
  x: number;
};

const ANCHO = 595;
const ALTO = 842;
const MARGEN = 50;
const LIMITE_INFERIOR = 70;

const X_SANGRIA = MARGEN + 16;

function leading(tamano: number): number {
  return Math.ceil(tamano * 1.45);
}

/** Parte un texto en líneas de a lo sumo `ancho` caracteres, sin cortar palabras. */
function envolver(texto: string, ancho: number): string[] {
  const palabras = texto.split(/\s+/).filter((palabra) => palabra.length > 0);
  const lineas: string[] = [];
  let actual = '';
  for (const original of palabras) {
    let palabra = original;
    while (palabra.length > ancho) {
      if (actual !== '') {
        lineas.push(actual);
        actual = '';
      }
      lineas.push(palabra.slice(0, ancho));
      palabra = palabra.slice(ancho);
    }
    const candidato = actual === '' ? palabra : `${actual} ${palabra}`;
    if (candidato.length <= ancho) {
      actual = candidato;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual !== '') lineas.push(actual);
  return lineas.length > 0 ? lineas : [''];
}

function formatoMoneda(valor: number, moneda: DocumentoPropuesta['moneda']): string {
  return formatearMoneda(valor, moneda);
}

/**
 * Convierte el documento en páginas de líneas posicionadas (A4, Helvetica).
 * Exportada para pruebas de contenido y exclusión de campos internos.
 */
export function construirPaginas(documento: DocumentoPropuesta): LineaPdf[][] {
  const paginas: LineaPdf[][] = [];
  let pagina: LineaPdf[] = [];
  let y = ALTO - MARGEN;

  const nuevaPagina = (): void => {
    paginas.push(pagina);
    pagina = [];
    y = ALTO - MARGEN;
  };

  const agregar = (
    texto: string,
    opciones: { tamano?: number; negrita?: boolean; x?: number } = {},
  ): void => {
    const tamano = opciones.tamano ?? 10;
    const salto = leading(tamano);
    if (y - salto < LIMITE_INFERIOR) nuevaPagina();
    pagina.push({
      texto,
      tamano,
      negrita: opciones.negrita ?? false,
      x: opciones.x ?? MARGEN,
    });
    y -= salto;
  };

  const espacio = (puntos: number): void => {
    if (y - puntos < LIMITE_INFERIOR) nuevaPagina();
    y -= puntos;
  };

  // Encabezado comercial.
  agregar(documento.titulo, { tamano: 18, negrita: true });
  agregar(`Folio de revisión: ${documento.folioRevision}`, { tamano: 11, negrita: true });
  agregar(`Fecha: ${documento.fecha}`);
  agregar(`Moneda: ${documento.moneda}`);
  espacio(8);

  agregar('Cliente', { tamano: 12, negrita: true });
  agregar(`Razón social: ${documento.cliente.razonSocial ?? '—'}`);
  if (documento.cliente.nombreComercial) {
    agregar(`Nombre comercial: ${documento.cliente.nombreComercial}`);
  }
  if (documento.cliente.rfc) agregar(`RFC: ${documento.cliente.rfc}`);
  if (documento.cliente.correo) agregar(`Correo: ${documento.cliente.correo}`);
  if (documento.contacto) {
    const contacto = [
      documento.contacto.nombre,
      documento.contacto.correo,
      documento.contacto.telefono,
    ]
      .filter((valor): valor is string => Boolean(valor))
      .join(' · ');
    if (contacto) agregar(`Contacto: ${contacto}`);
  }
  if (documento.condicionesPago) {
    agregar(`Condiciones de pago: ${documento.condicionesPago}`);
  }
  espacio(10);

  // Tabla de ítems (una línea por ítem; descripción envuelta con sangría).
  agregar('Ítems', { tamano: 12, negrita: true });
  agregar('Código · Descripción · Cantidad · Precio unitario · Importe', {
    tamano: 9,
    negrita: true,
  });

  if (documento.items.length === 0) {
    agregar('Sin ítems activos.', { tamano: 9 });
  }

  for (const item of documento.items) {
    const lineasDescripcion = envolver(item.descripcion, 52);
    agregar(
      `${item.codigo} · ${lineasDescripcion[0] ?? ''} · `
      + `${item.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 2 })} · `
      + `${formatoMoneda(item.precioUnitario, documento.moneda)} · `
      + `${formatoMoneda(item.importe, documento.moneda)}`,
      { tamano: 9 },
    );
    for (const linea of lineasDescripcion.slice(1)) {
      agregar(linea, { tamano: 9, x: X_SANGRIA });
    }
  }

  // Totales comerciales (sin costo ni margen: datos internos excluidos).
  espacio(12);
  agregar(`Subtotal: ${formatoMoneda(documento.totales.subtotal, documento.moneda)}`, {
    tamano: 10,
    negrita: true,
  });
  agregar(
    `IVA (${documento.totales.ivaPorcentaje}%): ${formatoMoneda(documento.totales.iva, documento.moneda)}`,
    { tamano: 10, negrita: true },
  );
  agregar(`Total: ${formatoMoneda(documento.totales.total, documento.moneda)}`, {
    tamano: 11,
    negrita: true,
  });

  paginas.push(pagina);
  return paginas;
}

function escapar(texto: string): string {
  return texto
    .split('')
    .map((caracter) => (caracter.charCodeAt(0) <= 255 ? caracter : '?'))
    .join('')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

type ObjetoPdf = { id: number; contenido: Buffer };

/** Serializa las páginas a un PDF 1.4 determinista (mismos datos ⇒ bytes). */
export function generarPdfBorrador(documento: DocumentoPropuesta): Buffer {
  const paginas = construirPaginas(documento);
  const objetos: ObjetoPdf[] = [];

  const catalogoId = 1;
  const pagesId = 2;
  const fuenteNormalId = 3;
  const fuenteNegritaId = 4;
  const primeraPaginaId = 5;
  const primeraStreamId = primeraPaginaId + paginas.length;

  objetos.push({
    id: catalogoId,
    contenido: Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'latin1'),
  });

  const kids = paginas
    .map((_, indice) => `${primeraPaginaId + indice} 0 R`)
    .join(' ');
  objetos.push({
    id: pagesId,
    contenido: Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`, 'latin1'),
  });

  objetos.push({
    id: fuenteNormalId,
    contenido: Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      'latin1',
    ),
  });
  objetos.push({
    id: fuenteNegritaId,
    contenido: Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      'latin1',
    ),
  });

  paginas.forEach((lineas, indice) => {
    const paginaId = primeraPaginaId + indice;
    const streamId = primeraStreamId + indice;
    objetos.push({
      id: paginaId,
      contenido: Buffer.from(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] `
        + `/Resources << /Font << /F1 ${fuenteNormalId} 0 R /F2 ${fuenteNegritaId} 0 R >> >> `
        + `/Contents ${streamId} 0 R >>`,
        'latin1',
      ),
    });

    objetos.push({
      id: streamId,
      contenido: Buffer.from(construirStream(lineas, paginas.length, indice), 'latin1'),
    });
  });

  return serializar(objetos);
}

function construirStream(lineas: LineaPdf[], total: number, indice: number): string {
  const partes: string[] = [];
  let y = ALTO - MARGEN;
  for (const linea of lineas) {
    const fuente = linea.negrita ? 'F2' : 'F1';
    partes.push(
      `BT /${fuente} ${linea.tamano} Tf 1 0 0 1 ${linea.x} ${y} Tm (${escapar(linea.texto)}) Tj ET`,
    );
    y -= leading(linea.tamano);
  }
  partes.push(
    `BT /F1 8 Tf 1 0 0 1 ${ANCHO / 2 - 30} 40 Tm (Página ${indice + 1} de ${total}) Tj ET`,
  );
  const contenido = partes.join('\n');
  return `<< /Length ${Buffer.byteLength(contenido, 'latin1')} >>\nstream\n${contenido}\nendstream`;
}

function serializar(objetos: ObjetoPdf[]): Buffer {
  const ordenados = [...objetos].sort((a, b) => a.id - b.id);
  const maxId = ordenados[ordenados.length - 1]?.id ?? 0;
  const fragmentos: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = new Map<number, number>();
  let posicion = fragmentos[0]!.length;

  for (const objeto of ordenados) {
    offsets.set(objeto.id, posicion);
    const cabecera = Buffer.from(`${objeto.id} 0 obj\n`, 'latin1');
    const cierre = Buffer.from('\nendobj\n', 'latin1');
    fragmentos.push(cabecera, objeto.contenido, cierre);
    posicion += cabecera.length + objeto.contenido.length + cierre.length;
  }

  const inicioXref = posicion;
  const xref: string[] = [`xref\n0 ${maxId + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= maxId; id += 1) {
    const offset = offsets.get(id) ?? 0;
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  xref.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  fragmentos.push(Buffer.from(xref.join(''), 'latin1'));

  return Buffer.concat(fragmentos);
}
