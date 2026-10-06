import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  construirDocumentoPropuesta,
  type DocumentoPropuesta,
} from '@/modulos/propuestas/servicios/pdf/documento-propuesta';
import {
  construirPaginas,
  generarPdfBorrador,
} from '@/modulos/propuestas/servicios/pdf/escritor-pdf';

/** Documento comercial de ejemplo con todos los campos públicos de §4.7.2. */
function documentoEjemplo(): DocumentoPropuesta {
  return construirDocumentoPropuesta({
    folioRevision: 'CNC-1026_01-A',
    fecha: '2026-10-06',
    moneda: 'MXN',
    cliente: {
      razonSocial: 'Metales del Norte SA de CV',
      nombreComercial: 'Metanor',
      rfc: 'MNO120101AB1',
      correo: 'compras@metanor.mx',
    },
    contacto: { nombre: 'Ana Compras', correo: 'ana@metanor.mx', telefono: '81 0000 0000' },
    condicionesPago: '30_dias',
    ivaPorcentaje: 16,
    items: [
      {
        codigo: 'IT01',
        descripcion: 'Pieza óptica ñ',
        cantidad: 10,
        precioUnitario: 100.5,
        esDescuento: false,
        activo: true,
      },
      {
        codigo: 'IT02',
        descripcion: 'Descuento comercial',
        cantidad: 1,
        precioUnitario: 20,
        esDescuento: true,
        activo: true,
      },
      {
        codigo: 'IT03',
        descripcion: 'Pieza cancelada',
        cantidad: 99,
        precioUnitario: 1000,
        esDescuento: false,
        activo: false,
      },
    ],
  });
}

describe('documento público del PDF (SII-B4.7)', () => {
  it('solo expone campos comerciales: nada de costo, margen, horas ni ruteo', () => {
    const documento = documentoEjemplo();
    const claves = Object.keys(documento).sort();
    expect(claves).toEqual(
      [
        'cliente',
        'condicionesPago',
        'contacto',
        'fecha',
        'folioRevision',
        'items',
        'moneda',
        'titulo',
        'totales',
      ].sort(),
    );
    expect(documento.items[0]).toEqual({
      codigo: 'IT01',
      descripcion: 'Pieza óptica ñ',
      cantidad: 10,
      precioUnitario: 100.5,
      importe: 1005,
    });
  });

  it('calcula subtotal/IVA/total con el descuento restado y descarta ítems inactivos', () => {
    const documento = documentoEjemplo();
    expect(documento.totales.subtotal).toBe(985);
    expect(documento.totales.iva).toBe(157.6);
    expect(documento.totales.total).toBe(1142.6);
  });
});

describe('escritor PDF interno (spike ADR-SII-04)', () => {
  it('genera un PDF 1.4 válido, determinista y con acentos', () => {
    const documento = documentoEjemplo();
    const primero = generarPdfBorrador(documento);
    const segundo = generarPdfBorrador(documento);

    expect(primero.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    expect(primero.toString('latin1')).toContain('%%EOF');
    expect(primero.equals(segundo)).toBe(true);
    expect(createHash('sha256').update(primero).digest('hex')).toBe(
      createHash('sha256').update(segundo).digest('hex'),
    );

    const texto = primero.toString('latin1');
    expect(texto).toContain('CNC-1026_01-A');
    expect(texto).toContain('Metales del Norte SA de CV');
    expect(texto).toContain('Ana Compras');
    expect(texto).toContain('IT01');
    expect(texto).toContain('Página 1 de 1');
    // Acento conservado en WinAnsi/Latin-1 (ó = 0xF3, ñ = 0xF1).
    expect(primero.includes(Buffer.from([0xf3]))).toBe(true);
    expect(primero.includes(Buffer.from([0xf1]))).toBe(true);
  });

  it('excluye del binario los campos internos (costo, margen, horas, ruteo)', () => {
    const documento = documentoEjemplo();
    const texto = generarPdfBorrador(documento).toString('latin1').toLowerCase();
    for (const prohibido of ['costo', 'margen', 'setup', 'run_horas', 'ruteo', 'mano de obra']) {
      expect(texto).not.toContain(prohibido);
    }
    expect(texto).toContain('subtotal');
    expect(texto).toContain('total');
  });

  it('pagina documentos largos', () => {
    const base = documentoEjemplo();
    const documento: DocumentoPropuesta = {
      ...base,
      items: Array.from({ length: 90 }, (_, indice) => ({
        codigo: `IT${String(indice + 1).padStart(2, '0')}`,
        descripcion: `Pieza número ${indice + 1} con descripción razonablemente larga`,
        cantidad: 1,
        precioUnitario: 100,
        importe: 100,
      })),
    };
    const paginas = construirPaginas(documento);
    expect(paginas.length).toBeGreaterThan(1);
    const texto = generarPdfBorrador(documento).toString('latin1');
    expect(texto).toContain(`Página 1 de ${paginas.length}`);
  });
});
