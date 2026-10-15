import { describe, expect, it } from 'vitest';

import { resumirProcesos } from '@/modulos/ordenes/utilidades/procesos';

describe('resumen de procesos de una partida (R07)', () => {
  it('un mismo proceso repetido se cuenta en vez de repetirse', () => {
    expect(resumirProcesos(['Láser CO₂', 'Láser CO₂'])).toBe('Láser CO₂ (2 operaciones)');
  });

  it('agrupa en la primera aparición y conserva el orden de los demás', () => {
    expect(resumirProcesos(['Corte', 'Doblez', 'Corte'])).toBe('Corte (2 operaciones) · Doblez');
  });

  it('un proceso sin repetición se muestra sin sufijo', () => {
    expect(resumirProcesos(['Corte'])).toBe('Corte');
    expect(resumirProcesos(['Corte', 'Doblez'])).toBe('Corte · Doblez');
  });

  it('sin procesos devuelve un guion', () => {
    expect(resumirProcesos([])).toBe('—');
    expect(resumirProcesos(['', '   '])).toBe('—');
  });

  it('agrupa variantes de mayúsculas, acentos y espacios y conserva el nombre de la primera', () => {
    expect(resumirProcesos(['Doblez', ' doblez ', 'DOBLÉZ'])).toBe('Doblez (3 operaciones)');
  });

  it('acepta otro separador (otros módulos conservan el suyo)', () => {
    expect(resumirProcesos(['Corte', 'Doblez', 'Corte'], ', ')).toBe('Corte (2 operaciones), Doblez');
  });
});
