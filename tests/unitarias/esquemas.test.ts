import { describe, expect, it } from 'vitest';
import { esquemaIniciarSesion } from '@/modulos/autenticacion/validaciones/esquemas-iniciar-sesion';
import { esquemaValidarPin } from '@/modulos/autenticacion/validaciones/esquemas-pin';

describe('esquemaIniciarSesion', () => {
  it('email inválido falla', () => {
    const resultado = esquemaIniciarSesion.safeParse({
      email: 'no-es-email',
      contrasena: 'contrasena-segura',
    });

    expect(resultado.success).toBe(false);
  });

  it('contraseña menor a 8 caracteres falla', () => {
    const resultado = esquemaIniciarSesion.safeParse({
      email: 'usuario@pruebas.mx',
      contrasena: 'corta',
    });

    expect(resultado.success).toBe(false);
  });

  it('entrada válida pasa', () => {
    const resultado = esquemaIniciarSesion.safeParse({
      email: 'usuario@pruebas.mx',
      contrasena: 'segura123',
    });

    expect(resultado.success).toBe(true);
  });

  it('normaliza el email a minúsculas', () => {
    const resultado = esquemaIniciarSesion.safeParse({
      email: 'Usuario@Ejemplo.COM',
      contrasena: 'segura123',
    });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.email).toBe('usuario@ejemplo.com');
    }
  });
});

describe('esquemaValidarPin', () => {
  it('PIN de 3 dígitos falla', () => {
    expect(esquemaValidarPin.safeParse({ pin: '123' }).success).toBe(false);
  });

  it('PIN de 7 dígitos falla', () => {
    expect(esquemaValidarPin.safeParse({ pin: '1234567' }).success).toBe(false);
  });

  it('PIN con letras falla', () => {
    expect(esquemaValidarPin.safeParse({ pin: 'abcd' }).success).toBe(false);
    expect(esquemaValidarPin.safeParse({ pin: '12a4' }).success).toBe(false);
  });

  it("PIN '1234' (mínimo) pasa", () => {
    const resultado = esquemaValidarPin.safeParse({ pin: '1234' });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.pin).toBe('1234');
    }
  });

  it("PIN '123456' (máximo) pasa", () => {
    const resultado = esquemaValidarPin.safeParse({ pin: '123456' });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.pin).toBe('123456');
    }
  });
});
