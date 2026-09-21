import { describe, expect, it } from 'vitest';
import {
  nombreDocumentoSeguro,
  validarRutaDocumento,
} from '@/modulos/produccion/servicios/documentos-orden-servicio';
import { resumirLineasNota } from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';

const COTIZACION = '22222222-2222-4222-8222-222222222222';

describe('validarRutaDocumento (OBS-06/ORD-09)', () => {
  it('acepta rutas dentro de la carpeta de la cotización de la orden', () => {
    expect(validarRutaDocumento(`${COTIZACION}/171234-plano.pdf`, COTIZACION)).toBe(true);
    expect(validarRutaDocumento(`${COTIZACION}/171234-cara.dxf`, COTIZACION)).toBe(true);
  });

  it('rechaza rutas ajenas, ambiguas o sin cotización', () => {
    expect(validarRutaDocumento('33333333-3333-4333-8333-333333333333/x.pdf', COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/../secreto.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}\\x.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento('', COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/${'a'.repeat(500)}.pdf`, COTIZACION)).toBe(false);
    expect(validarRutaDocumento(`${COTIZACION}/x.pdf`, null)).toBe(false);
  });
});

describe('nombreDocumentoSeguro', () => {
  it('sanea separadores y elimina puntos suspensivos', () => {
    expect(nombreDocumentoSeguro('carpeta/plano..v2.dxf')).toBe('carpeta_plano_v2.dxf');
    expect(nombreDocumentoSeguro('..\\..\\etc\\passwd')).toBe('____etc_passwd');
  });

  it('cae a "archivo" y acota nombres enormes', () => {
    expect(nombreDocumentoSeguro('   ')).toBe('archivo');
    const enorme = `${'x'.repeat(400)}.pdf`;
    const recortado = nombreDocumentoSeguro(enorme);
    expect(recortado.length).toBe(180);
    expect(recortado.endsWith('.pdf')).toBe(true);
  });
});

describe('resumirLineasNota (OBS-13)', () => {
  const renglon = {
    partidaId: 'partida-1',
    cantidadEntregada: 3,
    codigoPieza: 'COT-001',
    descripcion: 'Pieza QA',
    unidadMedida: 'pieza',
    cantidadSolicitada: 10,
  };

  it('usa el acumulado por partida y conserva los datos de la pieza', () => {
    const lineas = resumirLineasNota([renglon], new Map([['partida-1', 7]]));
    expect(lineas).toEqual([
      {
        codigoPieza: 'COT-001',
        descripcion: 'Pieza QA',
        unidadMedida: 'pieza',
        cantidadNota: 3,
        entregadoAcumulado: 7,
        cantidadSolicitada: 10,
      },
    ]);
  });

  it('sin historial acumulado usa la cantidad de la propia nota', () => {
    const lineas = resumirLineasNota([renglon], new Map());
    expect(lineas[0]?.entregadoAcumulado).toBe(3);
  });
});
