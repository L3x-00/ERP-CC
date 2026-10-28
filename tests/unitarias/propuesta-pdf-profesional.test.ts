import { describe, expect, it } from 'vitest';

import { construirDocumentoPropuesta } from '@/modulos/propuestas/servicios/pdf/documento-propuesta';
import { generarPdfPropuestaProfesional } from '@/modulos/propuestas/servicios/pdf/propuesta-pdf-profesional';

describe('PDF profesional de propuestas', () => {
  it('genera un PDF válido de presentación a partir del documento comercial público', async () => {
    const documento = construirDocumentoPropuesta({
      folioRevision: 'CNC-1026_01-A',
      fecha: '2026-10-28',
      moneda: 'MXN',
      empresa: {
        nombre: 'CC Manufacturing Group',
        razonSocial: 'CC Manufacturing Group, S. de R.L. de C.V.',
        rfc: 'CCM010101AA1',
        direccion: 'Tijuana, B.C., México',
        telefono: '664 000 0000',
        email: 'ventas@ccmanufacturing.mx',
      },
      cliente: { razonSocial: 'Metales del Norte SA de CV', nombreComercial: null, rfc: null, correo: null },
      contacto: null,
      condicionesPago: '30 días',
      plazoComercial: 'Fabricación 5-7 días hábiles',
      ivaPorcentaje: 16,
      items: [{
        codigo: 'IT01', descripcion: 'Pieza óptica', cantidad: 10, precioUnitario: 100, esDescuento: false, activo: true,
      }],
    });

    const pdf = await generarPdfPropuestaProfesional(documento);
    const texto = pdf.toString('latin1');

    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.3');
    expect(texto).toContain('%%EOF');
    expect(texto).toContain('Propuesta CNC-1026_01-A');
    expect(texto).toContain('CC Manufacturing Group, S. de R.L. de C.V.');
  });
});
