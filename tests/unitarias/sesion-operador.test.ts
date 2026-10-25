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
process.env.SECRETO_SESION_OPERADOR = 'secreto-de-pruebas-con-longitud-suficiente-32+';

const {
  deserializarSesionOperador,
  serializarSesionOperador,
  sesionOperadorEsDelegada,
  sesionOperadorExpirada,
  sesionOperadorRevocadaPorPin,
  sesionOperadorVencidaAbsoluta,
} =
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

describe('revocación por rotación del PIN', () => {
  it('conserva sesiones históricas sin marca y sesiones emitidas después del cambio', () => {
    expect(sesionOperadorRevocadaPorPin(crearSesion(), null)).toBe(false);
    const version = '2026-07-03T09:59:59.123456Z';
    expect(sesionOperadorRevocadaPorPin(crearSesion({ pinCambiadoEn: version }), version)).toBe(false);
  });

  it('revoca la cookie anterior al cambio, incluso si el cambio ocurre en el mismo milisegundo', () => {
    expect(sesionOperadorRevocadaPorPin(crearSesion(), '2026-07-03T10:00:01Z')).toBe(true);
    expect(sesionOperadorRevocadaPorPin(
      crearSesion({ pinCambiadoEn: '2026-07-03T10:00:00.111111Z' }),
      '2026-07-03T10:00:00.222222Z',
    )).toBe(true);
  });
});

describe('sesionOperadorExpirada', () => {
  it('C10: la sesión PIN no expira por inactividad', () => {
    const sesion = crearSesion({ timeoutMinutos: 15 });

    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:05:00.000Z'))).toBe(false);
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:16:00.000Z'))).toBe(false);
    // Un turno completo después sigue siendo la misma sesión de piso.
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-04T10:00:00.000Z'))).toBe(false);
  });

  it('C10: la sesión PIN tampoco vence por el máximo absoluto', () => {
    const sesion = crearSesion();

    expect(sesionOperadorVencidaAbsoluta(sesion, new Date('2026-07-04T10:00:00.000Z'))).toBe(false);
    expect(sesionOperadorVencidaAbsoluta(sesion, new Date('2027-07-03T10:00:00.000Z'))).toBe(false);
  });

  it('la vista delegada vence en su fecha fija aunque cambie la ultima actividad', () => {
    const sesion = crearSesion({
      modo: 'delegada',
      administradorId: '00000000-0000-4000-8000-000000000003',
      nombreAdministrador: 'Administradora Uno',
      motivoDelegacion: 'Validar instrucciones del trabajo',
      expiraEn: '2026-07-03T10:15:00.000Z',
      ultimaActividadEn: '2026-07-03T10:14:59.000Z',
    });

    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:14:59.000Z'))).toBe(false);
    expect(sesionOperadorExpirada(sesion, new Date('2026-07-03T10:15:00.001Z'))).toBe(true);
  });

  it('la vista delegada conserva el máximo absoluto de 8 h', () => {
    const sesion = crearSesion({
      modo: 'delegada',
      administradorId: '00000000-0000-4000-8000-000000000003',
      nombreAdministrador: 'Administradora Uno',
      motivoDelegacion: 'Validar instrucciones del trabajo',
      expiraEn: '2026-07-03T18:00:00.000Z',
    });

    expect(sesionOperadorVencidaAbsoluta(sesion, new Date('2026-07-03T17:59:00.000Z'))).toBe(false);
    expect(sesionOperadorVencidaAbsoluta(sesion, new Date('2026-07-03T18:01:00.000Z'))).toBe(true);
  });
});

describe('modo de sesion de operador', () => {
  it('trata una cookie historica sin modo como acceso PIN', () => {
    expect(sesionOperadorEsDelegada(crearSesion())).toBe(false);
  });

  it('identifica una vista administrativa delegada', () => {
    expect(sesionOperadorEsDelegada(crearSesion({
      modo: 'delegada',
      administradorId: '00000000-0000-4000-8000-000000000003',
      nombreAdministrador: 'Administradora Uno',
      motivoDelegacion: 'Validar instrucciones del trabajo',
      expiraEn: '2026-07-03T10:15:00.000Z',
    }))).toBe(true);
  });
});
