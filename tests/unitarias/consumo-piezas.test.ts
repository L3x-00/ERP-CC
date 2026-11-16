import { describe, expect, it } from 'vitest';

import {
  piezasUsadasEfectivas,
  validarConsumoPiezasCierre,
} from '@/modulos/produccion/utilidades/consumo-piezas';

const BASE = {
  usada: 0,
  merma: 0,
  producidas: 250,
  disponibles: 250,
  procesoPrevio: 'Corte laser',
  procesoActual: 'DOBLADO_CNC',
};

describe('consumo de piezas entre procesos (C17)', () => {
  it('asume consumo 1:1 cuando «Usado» queda en 0 en un proceso posterior', () => {
    expect(piezasUsadasEfectivas(0, 250, true)).toBe(250);
    expect(piezasUsadasEfectivas(0, 0, true)).toBe(0);
  });

  it('respeta lo capturado y no aplica la regla al primer proceso', () => {
    expect(piezasUsadasEfectivas(5, 250, true)).toBe(5);
    expect(piezasUsadasEfectivas(0, 250, false)).toBe(0);
  });

  it('cita el valor capturado y ofrece la corrección 1:1 al consumir menos', () => {
    const fallo = validarConsumoPiezasCierre({ ...BASE, usada: 2 });
    expect(fallo).not.toBeNull();
    expect(fallo?.mensaje).toContain('Declaraste 250 piezas producidas en DOBLADO_CNC');
    expect(fallo?.mensaje).toContain('«Usado» de Corte laser tiene 2');
    expect(fallo?.sugerirUnoAUno).toBe(true);
  });

  it('acepta el consumo 1:1 y el consumo con merma dentro de lo disponible', () => {
    expect(validarConsumoPiezasCierre({ ...BASE, usada: 250 })).toBeNull();
    expect(validarConsumoPiezasCierre({ ...BASE, usada: 250, merma: 0 })).toBeNull();
  });

  it('rechaza consumir más piezas de las disponibles', () => {
    const fallo = validarConsumoPiezasCierre({
      ...BASE,
      usada: 300,
      disponibles: 250,
    });
    expect(fallo?.mensaje).toContain('solo hay 250 disponibles');
    expect(fallo?.sugerirUnoAUno).toBe(false);
  });

  it('rechaza decimales y negativos', () => {
    expect(validarConsumoPiezasCierre({ ...BASE, usada: 1.5 })?.mensaje).toContain('números enteros');
    expect(validarConsumoPiezasCierre({ ...BASE, usada: -1 })?.mensaje).toContain('números enteros');
  });

  it('pide capturar al menos lo producido cuando se deja «Usado» por debajo', () => {
    const fallo = validarConsumoPiezasCierre({ ...BASE, usada: 0, producidas: 10, disponibles: 250 });
    expect(fallo?.mensaje).toContain('«Usado» de Corte laser tiene 0');
    expect(fallo?.mensaje).toContain('consumir 1:1');
    expect(fallo?.sugerirUnoAUno).toBe(true);
  });
});
