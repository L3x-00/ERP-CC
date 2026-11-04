import { describe, expect, it } from 'vitest';

import {
  construirHtmlImpresion,
  escaparHtml,
  MARCA_DOCUMENTO_NEUTRA,
  normalizarColorAcento,
} from '@/compartido/utilidades/impresion-documento';
import { construirHtmlHojaTrabajo } from '@/modulos/ordenes/utilidades/imprimir-hoja-trabajo';
import type { HojaTrabajoOrden } from '@/modulos/ordenes/tipos/ficha-orden';

const marca = {
  ...MARCA_DOCUMENTO_NEUTRA,
  nombre: 'CC Manufacturing',
  razonSocial: 'CC Manufacturing Group SA de CV',
  rfc: 'CCM010101AAA',
  direccion: 'Tijuana, B.C.',
  telefono: '664 000 0000',
  email: 'contacto@cc.mx',
  logoUrl: 'https://cdn.cc.mx/logo.png',
  colorAcento: '#0F766E',
  textoPiePagina: 'CC Manufacturing Group · Tijuana',
};

const hoja: HojaTrabajoOrden = {
  folio: 'O-1126_03',
  clienteNombre: 'Corporación Servi',
  observacionesOrden: 'Entregar sin rebaba',
  items: [
    {
      codigoItem: 'IT01',
      descripcion: 'Melamine',
      cantidad: 10,
      material: 'Lámina rolada en frío 14 ga',
      espesor: '2.0 mm',
      procesos: ['Láser fibra', 'Doblez'],
      observaciones: 'Cuidar cara visible',
    },
  ],
  archivos: [
    {
      archivoId: 'a-1',
      nombreOriginal: 'plano.pdf',
      nombreErp: null,
      origen: 'Propuesta',
      asociadoA: 'IT01',
      tipo: 'PDF',
      disponible: true,
    },
  ],
};

describe('documento impreso aislado', () => {
  it('escapa texto y normaliza el color de acento', () => {
    expect(escaparHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(escaparHtml(null)).toBe('');
    expect(normalizarColorAcento('#0F766E')).toBe('#0F766E');
    expect(normalizarColorAcento('javascript:alert(1)')).toBe('#1D4ED8');
  });

  it('incluye logo, color y pie de la empresa en el documento', () => {
    const html = construirHtmlImpresion({
      titulo: 'Orden de servicio O-1',
      folio: 'O-1',
      etiqueta: 'Orden de servicio',
      estado: 'En proceso',
      meta: ['Creada: 4/11/2026'],
      marca,
      cuerpoHtml: '<section><p>Contenido</p></section>',
    });

    expect(html).toContain('<title>Orden de servicio O-1</title>');
    expect(html).toContain('https://cdn.cc.mx/logo.png');
    expect(html).toContain('--acento: #0F766E');
    expect(html).toContain('CC Manufacturing Group SA de CV');
    expect(html).toContain('CC Manufacturing Group · Tijuana');
    expect(html).toContain('En proceso');
    expect(html).not.toContain('sidebar');
  });

  it('la hoja de trabajo imprime partidas, archivos y totales autorizados', () => {
    const html = construirHtmlHojaTrabajo({
      hoja,
      marca,
      compromiso: 'Compromiso comercial 6 de noviembre de 2026',
      totales: { subtotal: 1000, descuento: 0, iva: 160, total: 1160, moneda: 'MXN' },
    });

    expect(html).toContain('IT01');
    expect(html).toContain('Melamine');
    expect(html).toContain('Láser fibra → Doblez');
    expect(html).toContain('plano.pdf');
    expect(html).toContain('Entregar sin rebaba');
    expect(html).toContain('MXN 1,160.00');
    expect(html).toContain('Compromiso comercial 6 de noviembre de 2026');
  });

  it('sin totales autorizados la hoja no imprime economía', () => {
    const html = construirHtmlHojaTrabajo({ hoja, marca, totales: null });
    expect(html).not.toContain('Subtotal');
    expect(html).not.toContain('MXN');
  });
});
