import { describe, expect, it } from 'vitest';

import { MARCA_DOCUMENTO_NEUTRA } from '@/compartido/tipos/impresion';
import type { DocumentoNotaEntrega } from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';
import { construirHtmlNotaEntrega } from '@/modulos/produccion/utilidades/imprimir-nota-entrega';

const documento: DocumentoNotaEntrega = {
  empresa: {
    nombre: 'CC Manufacturing',
    razonSocial: 'CC Manufacturing Group SA de CV',
    rfc: 'CCM010101AAA',
    direccion: 'Tijuana, B.C.',
    telefono: '664 000 0000',
    email: 'contacto@cc.mx',
  },
  nota: {
    folio: 'NE-000123',
    esParcial: true,
    recibidoPor: 'Almacén E2E',
    firmaClienteUrl: null,
    creadoEn: '2026-11-13T10:00:00.000Z',
  },
  orden: { folio: 'OP-1', clienteRazonSocial: 'Cliente QA', clienteRfc: 'CQA010101AAA' },
  marca: {
    ...MARCA_DOCUMENTO_NEUTRA,
    nombre: 'CC Manufacturing',
    razonSocial: 'CC Manufacturing Group SA de CV',
    rfc: 'CCM010101AAA',
    logoUrl: 'https://cdn.cc.mx/logo.png',
    colorAcento: '#16395f',
    textoPiePagina: 'CC Manufacturing Group · Tijuana',
  },
  lineas: [
    {
      codigoPieza: 'P-01',
      descripcion: 'Placa <doblada>',
      unidadMedida: 'pza',
      cantidadNota: 4,
      entregadoAcumulado: 4,
      cantidadSolicitada: 10,
    },
  ],
  totalNota: 4,
  totalAcumulado: 4,
  totalSolicitado: 10,
};

describe('impresión de la nota de entrega', () => {
  it('compone un documento A4 con la marca y sin el modal del ERP', () => {
    const html = construirHtmlNotaEntrega(documento);

    expect(html).toContain('<title>Nota de entrega NE-000123</title>');
    expect(html).toContain('https://cdn.cc.mx/logo.png');
    expect(html).toContain('--acento: #16395f');
    expect(html).toContain('CC Manufacturing Group · Tijuana');
    expect(html).toContain('@page { size: A4; margin: 12mm; }');
    expect(html).toContain('NE-000123');
    expect(html).toContain('Almacén E2E');
    expect(html).toContain('Entrega parcial');
  });

  it('escapa descripciones y muestra los totales de la nota', () => {
    const html = construirHtmlNotaEntrega(documento);

    expect(html).toContain('Placa &lt;doblada&gt;');
    expect(html).toContain('4.00 pieza(s)');
    expect(html).toContain('4.00 de 10.00');
    expect(html).not.toContain('<doblada>');
  });
});
