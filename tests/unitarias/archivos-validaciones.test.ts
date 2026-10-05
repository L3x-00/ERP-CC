import { describe, expect, it } from 'vitest';

import {
  extensionDe,
  sanearNombreArchivo,
  validarSubidaArchivo,
} from '@/nucleo/almacenamiento/archivos/validaciones';

describe('sanearNombreArchivo', () => {
  it('quita rutas y caracteres peligrosos conservando la extensión', () => {
    expect(sanearNombreArchivo('C:\\planos\\..\\pieza final!.dxf')).toBe('pieza_final_.dxf');
  });

  it('limita la longitud y nunca devuelve vacío', () => {
    expect(sanearNombreArchivo('')).toBe('archivo');
    expect(sanearNombreArchivo('a'.repeat(300)).length).toBe(120);
  });
});

describe('extensionDe', () => {
  it('devuelve la extensión en minúsculas', () => {
    expect(extensionDe('PLANO.DXF')).toBe('dxf');
  });

  it('devuelve cadena vacía si no hay extensión', () => {
    expect(extensionDe('sin-extension')).toBe('');
  });
});

describe('validarSubidaArchivo', () => {
  it('acepta un PDF de cliente dentro del límite', () => {
    expect(validarSubidaArchivo('cliente', { nombre: 'csf.pdf', tamano: 1024 }).ok).toBe(true);
  });

  it('rechaza extensiones fuera del perfil', () => {
    const resultado = validarSubidaArchivo('cliente', { nombre: 'virus.exe', tamano: 10 });
    expect(resultado.ok).toBe(false);
  });

  it('rechaza archivos vacíos y por encima del máximo', () => {
    expect(validarSubidaArchivo('cliente', { nombre: 'csf.pdf', tamano: 0 }).ok).toBe(false);
    expect(
      validarSubidaArchivo('cliente', { nombre: 'csf.pdf', tamano: 11 * 1024 * 1024 }).ok,
    ).toBe(false);
  });

  it('acepta CAD en adjuntos de RFQ y rechaza documentos de texto en entrega', () => {
    expect(validarSubidaArchivo('rfq', { nombre: 'plano.dxf', tamano: 2048 }).ok).toBe(true);
    expect(validarSubidaArchivo('entrega', { nombre: 'contrato.docx', tamano: 2048 }).ok).toBe(
      false,
    );
  });
});
