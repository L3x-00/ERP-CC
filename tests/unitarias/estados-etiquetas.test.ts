// QA 2026-11-15 (item 10): ningún enum crudo llega a la pantalla.
// Un solo mapa traduce el estado para badges y para textos planos.
import { describe, expect, it } from 'vitest';

import {
  definicionEstado,
  etiquetaEstado,
  normalizarEstado,
} from '@/compartido/utilidades/estados';

describe('etiquetaEstado', () => {
  it('traduce los enums en minúsculas del flujo de producción', () => {
    expect(etiquetaEstado('en_proceso')).toBe('En proceso');
    expect(etiquetaEstado('pausada')).toBe('Pausada');
    expect(etiquetaEstado('en_preparacion')).toBe('En preparación');
  });

  it('traduce los enums en mayúsculas de SII sin mostrarlos crudos', () => {
    expect(etiquetaEstado('EN_PRODUCCION')).toBe('En producción');
    expect(etiquetaEstado('PRODUCCION_COMPLETADA')).toBe('Producción completada');
    expect(etiquetaEstado('PLANIFICADA')).toBe('Planificada');
  });

  it('tolera espacios y guiones alrededor del valor', () => {
    expect(etiquetaEstado('  en-proceso  ')).toBe('En proceso');
    expect(normalizarEstado('PARCIALMENTE PAGADA')).toBe('parcialmente_pagada');
  });

  it('traduce el estado de una sesión de producción', () => {
    expect(etiquetaEstado('activa')).toBe('Activa');
    expect(etiquetaEstado('finalizada')).toBe('Finalizada');
  });

  it('devuelve el texto original si el estado no está catalogado', () => {
    expect(etiquetaEstado('estado_nuevo')).toBe('estado_nuevo');
  });

  it('muestra un guion cuando no hay estado', () => {
    expect(etiquetaEstado(null)).toBe('—');
    expect(etiquetaEstado(undefined)).toBe('—');
  });

  it('expone el tono semántico para el badge', () => {
    expect(definicionEstado('vencida')?.tono).toBe('peligro');
    expect(definicionEstado('en_proceso')?.ping).toBe(true);
    expect(definicionEstado('desconocido')).toBeUndefined();
  });
});
