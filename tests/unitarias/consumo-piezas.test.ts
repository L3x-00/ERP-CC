import { describe, expect, it } from 'vitest';

import {
  mensajeMotivoConsumoPiezas,
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

  it('cita el valor capturado y ofrece la corrección al consumir menos', () => {
    const fallo = validarConsumoPiezasCierre({ ...BASE, usada: 2 });
    expect(fallo).not.toBeNull();
    expect(fallo?.titulo).toBe('Revisa el consumo de piezas');
    expect(fallo?.mensaje).toBe(
      'Declaraste 250 piezas terminadas en DOBLADO_CNC, pero el campo Usado de Corte laser tiene 2. Para cerrar, deja Usado en 0 y el sistema tomará las 250 piezas, o escribe 250 o más.',
    );
    expect(fallo?.sugerirUsarProducidas).toBe(true);
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
    expect(fallo?.mensaje).toBe(
      'Solo hay 250 piezas terminadas por Corte laser. Bajaste 300 entre usadas y mermas; ajusta Usado o Merma para continuar.',
    );
    expect(fallo?.sugerirUsarProducidas).toBe(false);
  });

  it('rechaza decimales y negativos', () => {
    expect(validarConsumoPiezasCierre({ ...BASE, usada: 1.5 })?.mensaje).toContain('números enteros');
    expect(validarConsumoPiezasCierre({ ...BASE, usada: -1 })?.mensaje).toContain('números enteros');
  });

  it('pide capturar al menos lo producido cuando se deja «Usado» por debajo', () => {
    const fallo = validarConsumoPiezasCierre({ ...BASE, usada: 0, producidas: 10, disponibles: 250 });
    expect(fallo?.mensaje).toContain('el campo Usado de Corte laser tiene 0');
    expect(fallo?.mensaje).toContain('el sistema tomará las 10 piezas');
    expect(fallo?.sugerirUsarProducidas).toBe(true);
  });

  it('explica el motivo con una frase que dice qué escribir', () => {
    expect(mensajeMotivoConsumoPiezas('Corte laser', 250)).toBe(
      'Escribe por qué consumiste 250 piezas de Corte laser. Necesitamos al menos 3 caracteres.',
    );
  });
});
