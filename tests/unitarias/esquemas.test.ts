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
  it.each(['123', '1234', '12345'])('PIN de %s dígitos falla (se exigen 6)', (pin) => {
    expect(esquemaValidarPin.safeParse({ pin }).success).toBe(false);
  });

  it('PIN de 7 dígitos falla', () => {
    expect(esquemaValidarPin.safeParse({ pin: '1234567' }).success).toBe(false);
  });

  it('PIN con letras falla', () => {
    expect(esquemaValidarPin.safeParse({ pin: 'abcdef' }).success).toBe(false);
    expect(esquemaValidarPin.safeParse({ pin: '12a456' }).success).toBe(false);
  });

  it("PIN '000042' de exactamente 6 dígitos pasa y conserva ceros iniciales", () => {
    const resultado = esquemaValidarPin.safeParse({ pin: '000042' });

    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.pin).toBe('000042');
    }
  });
});
