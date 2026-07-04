import { describe, expect, it } from 'vitest';
import {
  esReversion,
  esTransicionValida,
} from '@/modulos/pipeline/servicios/reglas-transicion';

describe('esTransicionValida (avance)', () => {
  it('acepta el camino feliz completo', () => {
    expect(esTransicionValida('prospecto', 'contactado')).toBe(true);
    expect(esTransicionValida('contactado', 'cotizado')).toBe(true);
    expect(esTransicionValida('cotizado', 'negociacion')).toBe(true);
    expect(esTransicionValida('negociacion', 'ganada')).toBe(true);
  });

  it('acepta perder desde cualquier etapa activa', () => {
    expect(esTransicionValida('prospecto', 'perdida')).toBe(true);
    expect(esTransicionValida('contactado', 'perdida')).toBe(true);
    expect(esTransicionValida('cotizado', 'perdida')).toBe(true);
    expect(esTransicionValida('negociacion', 'perdida')).toBe(true);
  });

  it('rechaza saltarse etapas', () => {
    expect(esTransicionValida('prospecto', 'cotizado')).toBe(false);
    expect(esTransicionValida('contactado', 'ganada')).toBe(false);
    expect(esTransicionValida('prospecto', 'ganada')).toBe(false);
  });

  it('rechaza transición a la misma etapa', () => {
    expect(esTransicionValida('cotizado', 'cotizado')).toBe(false);
  });

  it('etapas terminales no avanzan', () => {
    expect(esTransicionValida('ganada', 'negociacion')).toBe(false);
    expect(esTransicionValida('perdida', 'prospecto')).toBe(false);
  });
});

describe('esReversion (retroceso)', () => {
  it('detecta retrocesos en el orden de avance', () => {
    expect(esReversion('cotizado', 'contactado')).toBe(true);
    expect(esReversion('negociacion', 'prospecto')).toBe(true);
    expect(esReversion('ganada', 'negociacion')).toBe(true);
  });

  it('un avance no es reversión', () => {
    expect(esReversion('prospecto', 'contactado')).toBe(false);
    expect(esReversion('cotizado', 'negociacion')).toBe(false);
  });

  it('pasar a una etapa terminal nunca es reversión', () => {
    expect(esReversion('negociacion', 'perdida')).toBe(false);
    expect(esReversion('prospecto', 'perdida')).toBe(false);
    // Clave de seguridad: ir a 'ganada' jamás es reversión (evita fijar ganada
    // por la vía de reversión saltándose aprobar_ordenes y la promoción).
    expect(esReversion('negociacion', 'ganada')).toBe(false);
    expect(esReversion('perdida', 'ganada')).toBe(false);
  });

  it('deshacer un cierre terminal hacia una etapa activa SÍ es reversión', () => {
    expect(esReversion('perdida', 'negociacion')).toBe(true);
    expect(esReversion('perdida', 'prospecto')).toBe(true);
    expect(esReversion('ganada', 'negociacion')).toBe(true);
  });
});
