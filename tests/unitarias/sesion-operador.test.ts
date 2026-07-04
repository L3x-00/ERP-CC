import { describe, expect, it } from 'vitest';
import { TIMEOUT_SESION_OPERADOR_MINUTOS } from '@/nucleo/autenticacion/constantes';
import type { SesionOperador } from '@/modulos/autenticacion/tipos/indice';

// El secreto debe existir ANTES de que el módulo de sesión se importe y
// evalúe. Los `import` estáticos se "hoistean" en ESM: se ejecutan antes
// que cualquier código del propio archivo de prueba, sin importar el
// orden textual. Por eso la variable de entorno se asigna aquí y el
// módulo bajo prueba se carga con `import()` dinámico (no hoisteable):
// así el test funciona sin importar si `sesion.ts` lee `process.env` al
// cargar el módulo o de forma diferida dentro de cada función.
process.env.SECRETO_SESION_OPERADOR = 'secreto-pruebas';

const { deserializarSesionOperador, serializarSesionOperador, sesionOperadorExpirada } =
  await import('@/nucleo/autenticacion/sesion');

/**
 * Construye una SesionOperador de pruebas con fechas controladas.
 */
function crearSesion(sobrescribir?: Partial<SesionOperador>): SesionOperador {
  return {
    usuarioId: '00000000-0000-4000-8000-000000000002',
    nombreUsuario: 'Operador Uno',
    iniciadaEn: '2026-07-03T10:00:00.000Z',
    ultimaActividadEn: '2026-07-03T10:00:00.000Z',
    timeoutMinutos: TIMEOUT_SESION_OPERADOR_MINUTOS,
    ...sobrescribir,
  };
}

describe('serializarSesionOperador / deserializarSesionOperador', () => {
  it('roundtrip: serializar y deserializar devuelve la misma sesión', async () => {
    const sesion = crearSesion();

    const valorCookie = await serializarSesionOperador(sesion);
    const recuperada = await deserializarSesionOperador(valorCookie);

    expect(recuperada).toEqual(sesion);
  });

  it('el valor serializado tiene formato payload.firma', async () => {
    const valorCookie = await serializarSesionOperador(crearSesion());

    expect(valorCookie.split('.')).toHaveLength(2);
  });

  it('firma alterada → null', async () => {
    const valorCookie = await serializarSesionOperador(crearSesion());
    const [payload, firma] = valorCookie.split('.');
    const firmaAlterada = (firma[0] === 'A' ? 'B' : 'A') + firma.slice(1);

    const resultado = await deserializarSesionOperador(`${payload}.${firmaAlterada}`);

    expect(resultado).toBeNull();
  });

  it('payload alterado (firma ya no corresponde) → null', async () => {
    const valorCookie = await serializarSesionOperador(crearSesion());
    const [payload, firma] = valorCookie.split('.');
    const payloadAlterado = (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1);

    const resultado = await deserializarSesionOperador(`${payloadAlterado}.${firma}`);

    expect(resultado).toBeNull();
  });

  it('basura sin formato → null', async () => {
    expect(await deserializarSesionOperador('no-es-una-cookie')).toBeNull();
    expect(await deserializarSesionOperador('')).toBeNull();
    expect(await deserializarSesionOperador('a.b.c')).toBeNull();
    expect(await deserializarSesionOperador('%%%.$$$')).toBeNull();
  });
});

describe('sesionOperadorExpirada', () => {
  it('sesión dentro del timeout de 15 minutos NO está expirada', () => {
    const sesion = crearSesion({ timeoutMinutos: 15 });

    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:05:00.000Z'))).toBe(false);
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:14:00.000Z'))).toBe(false);
  });

  it('sesión pasado el timeout de 15 minutos SÍ está expirada', () => {
    const sesion = crearSesion({ timeoutMinutos: 15 });

    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:16:00.000Z'))).toBe(true);
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T11:00:00.000Z'))).toBe(true);
  });

  it('la expiración se calcula desde ultimaActividadEn, no desde iniciadaEn', () => {
    const sesion = crearSesion({
      iniciadaEn: '2026-07-03T09:00:00.000Z',
      ultimaActividadEn: '2026-07-03T10:00:00.000Z',
      timeoutMinutos: 15,
    });

    // Una hora después de iniciar, pero solo 10 min tras la última actividad.
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:10:00.000Z'))).toBe(false);
  });
});
