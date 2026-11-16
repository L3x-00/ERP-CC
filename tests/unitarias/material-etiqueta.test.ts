// QA 2026-11-15 (item 3): el select de material no debe ocultar el código.
import { describe, expect, it } from 'vitest';

import { detalleMaterial, etiquetaMaterial } from '@/compartido/utilidades/material-etiqueta';

describe('etiquetaMaterial', () => {
  it('pone el código primero y separa con punto medio', () => {
    expect(etiquetaMaterial('CRS-14', 'Acero al carbón calibre 14')).toBe(
      'CRS-14 · Acero al carbón calibre 14',
    );
  });

  it('omite el separador cuando falta uno de los dos datos', () => {
    expect(etiquetaMaterial('', 'Acero al carbón')).toBe('Acero al carbón');
    expect(etiquetaMaterial('CRS-14', '   ')).toBe('CRS-14');
  });

  it('recorta espacios accidentales', () => {
    expect(etiquetaMaterial('  CRS-14 ', ' Acero ')).toBe('CRS-14 · Acero');
  });
});

describe('detalleMaterial', () => {
  it('agrega la unidad cuando existe', () => {
    expect(detalleMaterial('CRS-14', 'Acero al carbón', 'm2')).toBe(
      'CRS-14 · Acero al carbón · m2',
    );
  });

  it('no agrega un separador vacío sin unidad', () => {
    expect(detalleMaterial('CRS-14', 'Acero al carbón', null)).toBe('CRS-14 · Acero al carbón');
    expect(detalleMaterial('CRS-14', 'Acero al carbón', '  ')).toBe('CRS-14 · Acero al carbón');
  });
});
