import { describe, expect, it } from 'vitest';
import {
  formatearFecha,
  formatearFechaCorta,
  formatearMoneda,
  obtenerAnidado,
  parsearJSON,
} from '@/compartido/utilidades/indice';

describe('formatearFecha', () => {
  it('no corre el día en una fecha calendario (regresión QA: 2026-12-04)', () => {
    expect(formatearFecha('2026-12-04')).toBe('4 de diciembre de 2026');
  });

  it('no corre el día cuando Postgres devuelve la fecha a medianoche UTC', () => {
    expect(formatearFecha('2026-12-04T00:00:00+00:00')).toBe('4 de diciembre de 2026');
  });

  it('conserva la zona local para un instante con hora', () => {
    expect(formatearFecha('2026-12-04T15:00:00Z')).toBe('4 de diciembre de 2026');
  });

  it('devuelve un guion para valores inválidos', () => {
    expect(formatearFecha('no-es-fecha')).toBe('—');
  });
});

describe('formatearFechaCorta', () => {
  it('formatea una fecha calendario como dd/mm/aaaa sin correr el día', () => {
    expect(formatearFechaCorta('2026-12-04')).toBe('04/12/2026');
    expect(formatearFechaCorta('2026-12-04T00:00:00+00:00')).toBe('04/12/2026');
  });
});

describe('formatearMoneda', () => {
  it('incluye el símbolo de pesos', () => {
    expect(formatearMoneda(1500.5)).toContain('$');
    expect(formatearMoneda(0)).toContain('$');
  });

  it('incluye separador de miles y dos decimales (es-MX)', () => {
    const resultado = formatearMoneda(1234567.89);

    expect(resultado).toContain('1,234,567.89');
  });

  it('formatea cantidades sin decimales con .00', () => {
    expect(formatearMoneda(1000)).toContain('1,000.00');
  });
});

describe('parsearJSON', () => {
  it('parsea JSON válido y conserva la estructura', () => {
    const resultado = parsearJSON<{ a: number; b: string }>('{"a":1,"b":"hola"}');

    expect(resultado).toEqual({ a: 1, b: 'hola' });
  });

  it('JSON inválido sin defecto → null', () => {
    expect(parsearJSON('{invalido')).toBeNull();
    expect(parsearJSON('')).toBeNull();
  });

  it('JSON inválido con defecto → retorna el defecto', () => {
    const defecto = { a: 0 };

    expect(parsearJSON('{invalido', defecto)).toEqual(defecto);
    expect(parsearJSON('no-json', 'valor-defecto')).toBe('valor-defecto');
  });
});

describe('obtenerAnidado', () => {
  const objeto = {
    usuario: {
      perfil: {
        nombre: 'Ana',
        contacto: { email: 'ana@pruebas.mx' },
      },
    },
    total: 42,
  };

  it('obtiene valor en ruta profunda', () => {
    expect(obtenerAnidado(objeto, 'usuario.perfil.nombre')).toBe('Ana');
    expect(obtenerAnidado(objeto, 'usuario.perfil.contacto.email')).toBe('ana@pruebas.mx');
    expect(obtenerAnidado(objeto, 'total')).toBe(42);
  });

  it('ruta inexistente → undefined', () => {
    expect(obtenerAnidado(objeto, 'usuario.direccion.calle')).toBeUndefined();
    expect(obtenerAnidado(objeto, 'nada')).toBeUndefined();
  });

  it('objeto null o intermedio no-objeto → undefined', () => {
    expect(obtenerAnidado(null, 'a.b')).toBeUndefined();
    expect(obtenerAnidado({ a: 5 }, 'a.b')).toBeUndefined();
  });
});
