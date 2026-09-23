import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  VARIABLE_CLAVE_ANONIMA,
  VARIABLE_CLAVE_SERVICIO,
  VARIABLE_URL,
  esUrlSupabaseLoopback,
  exigirUrlLoopback,
  obtenerEntornoSupabaseLocal,
  prepararSuiteSupabaseLocal,
} from '../utilidades/entorno-supabase';
import {
  cargarEntornoLocal,
  esUrlSupabaseLoopback as esUrlSupabaseLoopbackSemillas,
  exigirSupabaseLocal,
} from '../../supabase/semillas/guardia-supabase-local.mjs';

/**
 * A10–A11: pruebas negativas del aislamiento. Ninguna abre un socket — se
 * verifica explícitamente que `fetch` nunca se invoca (ver el espía global).
 *
 * Las URL "remotas" de este archivo son inventadas y no corresponden al
 * proyecto real; nunca se usan para construir un cliente.
 */

const URL_REMOTA_FICTICIA = 'https://proyecto-inventado.supabase.co';
const CLAVE_FICTICIA = 'clave-de-prueba-sin-valor';

const fetchEspia = vi.fn(() => {
  throw new Error('Ninguna prueba de aislamiento debe hacer peticiones de red');
});

beforeAll(() => {
  vi.stubGlobal('fetch', fetchEspia);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const CASOS_LOOPBACK: ReadonlyArray<readonly [string, boolean]> = [
  ['http://127.0.0.1:54321', true],
  ['http://127.0.0.1', true],
  ['http://127.1.2.3:54321', true],
  ['http://localhost:54321', true],
  ['https://LOCALHOST:54321', true],
  ['http://[::1]:54321', true],
  // Trampas clásicas de comparación por substring o por prefijo.
  ['https://127.0.0.1.ejemplo.net', false],
  ['https://localhost.ejemplo.net', false],
  ['https://proyecto-inventado.supabase.co/?host=127.0.0.1', false],
  ['https://proyecto-inventado.supabase.co#localhost', false],
  ['https://usuario:clave@proyecto-inventado.supabase.co', false],
  ['http://127.0.0.256', false],
  ['http://10.0.0.5:54321', false],
  ['postgres://127.0.0.1:54322', false],
  ['no-es-una-url', false],
  ['', false],
];

describe('A10–A11: guardia de aislamiento de Supabase', () => {
  describe('detección de loopback', () => {
    it.each(CASOS_LOOPBACK)('clasifica %s', (url, esperado) => {
      expect(esUrlSupabaseLoopback(url)).toBe(esperado);
    });

    it('la guardia de semillas clasifica igual que la de pruebas', () => {
      for (const [url, esperado] of CASOS_LOOPBACK) {
        expect(esUrlSupabaseLoopbackSemillas(url)).toBe(esperado);
        expect(esUrlSupabaseLoopbackSemillas(url)).toBe(esUrlSupabaseLoopback(url));
      }
    });

    it('trata undefined y null como no loopback', () => {
      expect(esUrlSupabaseLoopback(undefined)).toBe(false);
      expect(esUrlSupabaseLoopback(null)).toBe(false);
      expect(esUrlSupabaseLoopbackSemillas(undefined)).toBe(false);
    });
  });

  describe('bloqueo de URL remota en pruebas de integración', () => {
    it('exigirUrlLoopback lanza con una URL remota', () => {
      expect(() => exigirUrlLoopback('caso', URL_REMOTA_FICTICIA)).toThrow(/no apunta a loopback/);
    });

    it('el mensaje de error no filtra la URL ni la clave', () => {
      vi.stubEnv(VARIABLE_URL, URL_REMOTA_FICTICIA);
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, CLAVE_FICTICIA);
      let mensaje = '';
      try {
        obtenerEntornoSupabaseLocal('caso');
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }
      expect(mensaje).not.toBe('');
      expect(mensaje).not.toContain(URL_REMOTA_FICTICIA);
      expect(mensaje).not.toContain('proyecto-inventado');
      expect(mensaje).not.toContain(CLAVE_FICTICIA);
    });

    it('prepararSuiteSupabaseLocal aborta al importar, antes de abrir cliente', () => {
      vi.stubEnv(VARIABLE_URL, URL_REMOTA_FICTICIA);
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, CLAVE_FICTICIA);
      expect(() => prepararSuiteSupabaseLocal('suite mutadora')).toThrow(/no apunta a loopback/);
      expect(fetchEspia).not.toHaveBeenCalled();
    });

    it('con loopback devuelve el entorno verificado', () => {
      vi.stubEnv(VARIABLE_URL, 'http://127.0.0.1:54321');
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, CLAVE_FICTICIA);
      vi.stubEnv(VARIABLE_CLAVE_ANONIMA, 'anon-de-prueba');
      const entorno = obtenerEntornoSupabaseLocal('caso');
      expect(entorno).toEqual({
        url: 'http://127.0.0.1:54321',
        claveServicio: CLAVE_FICTICIA,
        claveAnonima: 'anon-de-prueba',
      });
    });

    it('sin credenciales la suite se omite en vez de fallar', () => {
      vi.stubEnv(VARIABLE_URL, '');
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, '');
      const suite = prepararSuiteSupabaseLocal('suite mutadora');
      expect(suite.omitida).toBe(true);
      expect(() => suite.crearClienteServicio()).toThrow(/no hay stack Supabase local/);
    });

    it('omite la suite que exige clave anónima cuando falta', () => {
      vi.stubEnv(VARIABLE_URL, 'http://127.0.0.1:54321');
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, CLAVE_FICTICIA);
      vi.stubEnv(VARIABLE_CLAVE_ANONIMA, '');
      const suite = prepararSuiteSupabaseLocal('suite RLS', { requiereClaveAnonima: true });
      expect(suite.omitida).toBe(true);
      expect(() => suite.crearClienteAnonimo()).toThrow(/no hay stack Supabase local/);
    });

    it('con stack local completo la suite corre', () => {
      vi.stubEnv(VARIABLE_URL, 'http://127.0.0.1:54321');
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, CLAVE_FICTICIA);
      vi.stubEnv(VARIABLE_CLAVE_ANONIMA, 'anon-de-prueba');
      expect(prepararSuiteSupabaseLocal('suite RLS', { requiereClaveAnonima: true }).omitida)
        .toBe(false);
    });
  });

  describe('prioridad del entorno explícito', () => {
    it('las utilidades de prueba no leen .env.local: solo process.env manda', () => {
      // `.env.local` del repo apunta al proyecto remoto. Si el loader lo leyera,
      // este caso vería una URL remota en vez de la explícita.
      vi.stubEnv(VARIABLE_URL, 'http://127.0.0.1:54321');
      vi.stubEnv(VARIABLE_CLAVE_SERVICIO, 'clave-explicita');
      expect(obtenerEntornoSupabaseLocal('caso')?.url).toBe('http://127.0.0.1:54321');
      expect(obtenerEntornoSupabaseLocal('caso')?.claveServicio).toBe('clave-explicita');
    });

    it('el loader de semillas nunca pisa una variable ya definida', () => {
      const directorio = mkdtempSync(join(tmpdir(), 'orca-aislamiento-'));
      const ruta = join(directorio, '.env.local');
      writeFileSync(
        ruta,
        [
          `NEXT_PUBLIC_SUPABASE_URL=${URL_REMOTA_FICTICIA}`,
          'SUPABASE_SERVICE_ROLE_KEY=clave-del-archivo',
          'VARIABLE_SOLO_DEL_ARCHIVO=valor-archivo',
        ].join('\n'),
        'utf8',
      );
      try {
        const entorno: Record<string, string | undefined> = {
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        };
        const cargadas = cargarEntornoLocal(ruta, entorno);

        // La explícita sobrevive; solo se rellenan las ausentes.
        expect(entorno.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
        expect(entorno.SUPABASE_SERVICE_ROLE_KEY).toBe('clave-del-archivo');
        expect(entorno.VARIABLE_SOLO_DEL_ARCHIVO).toBe('valor-archivo');
        expect(cargadas).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
      } finally {
        rmSync(directorio, { recursive: true, force: true });
      }
    });

    it('sin archivo el loader no aporta nada y no lanza', () => {
      const entorno: Record<string, string | undefined> = {};
      expect(cargarEntornoLocal(join(tmpdir(), 'no-existe-orca', '.env.local'), entorno)).toEqual([]);
      expect(entorno).toEqual({});
    });
  });

  describe('bloqueo de URL remota en semillas mutadoras', () => {
    it('lanza antes de abrir cliente cuando la URL no es loopback', () => {
      expect(() => exigirSupabaseLocal('semilla', {
        NEXT_PUBLIC_SUPABASE_URL: URL_REMOTA_FICTICIA,
        SUPABASE_SERVICE_ROLE_KEY: CLAVE_FICTICIA,
      })).toThrow(/no apunta a loopback/);
    });

    it('el mensaje no filtra la URL remota', () => {
      let mensaje = '';
      try {
        exigirSupabaseLocal('semilla', { NEXT_PUBLIC_SUPABASE_URL: URL_REMOTA_FICTICIA });
      } catch (error) {
        mensaje = error instanceof Error ? error.message : String(error);
      }
      expect(mensaje).not.toContain('proyecto-inventado');
    });

    it('lanza cuando falta la URL', () => {
      expect(() => exigirSupabaseLocal('semilla', {})).toThrow(/falta la variable de entorno/);
    });

    it('acepta loopback', () => {
      expect(exigirSupabaseLocal('semilla', {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      })).toBe('http://127.0.0.1:54321');
    });

    it('no habilita destino remoto aunque se declare una variable de excepción', () => {
      expect(() => exigirSupabaseLocal('semilla', {
        NEXT_PUBLIC_SUPABASE_URL: URL_REMOTA_FICTICIA,
        PERMITIR_SUPABASE_NO_LOOPBACK: 'si',
      })).toThrow(/no apunta a loopback/);
    });
  });

  /**
   * Inventario vivo: el aislamiento se pierde en cuanto alguien añade un
   * archivo nuevo con el patrón viejo. Estos casos leen el repo y fallan si
   * aparece una ruta mutadora sin guardia.
   */
  describe('inventario de rutas mutadoras', () => {
    const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const DIRECTORIO_INTEGRACION = join(RAIZ, 'tests', 'integracion');
    const DIRECTORIO_SEMILLAS = join(RAIZ, 'supabase', 'semillas');

    /**
     * `verificar-motor-capacidad.mjs` usa `supabase db query --local`,
     * que fija el destino sin URL de entorno.
     * `guardia-supabase-local.mjs`: es la guardia misma.
     */
    const SEMILLAS_SIN_URL = new Set(['verificar-motor-capacidad.mjs', 'guardia-supabase-local.mjs']);
    const NOMBRE_PROPIO = 'aislamiento-entorno.test.ts';

    const archivosIntegracion = readdirSync(DIRECTORIO_INTEGRACION)
      .filter((nombre) => nombre.endsWith('.test.ts') && nombre !== NOMBRE_PROPIO);
    const semillas = readdirSync(DIRECTORIO_SEMILLAS)
      .filter((nombre) => nombre.endsWith('.mjs'));

    /** Referencia en código (literal entrecomillado), no una mención en comentario. */
    const REFERENCIA_ENV_LOCAL = /['"`][^'"`\n]*\.env\.local/;

    it('encuentra los archivos esperados', () => {
      expect(archivosIntegracion.length).toBeGreaterThan(10);
      expect(semillas.length).toBeGreaterThan(5);
    });

    it.each(archivosIntegracion)('%s no lee .env.local', (nombre) => {
      expect(readFileSync(join(DIRECTORIO_INTEGRACION, nombre), 'utf8'))
        .not.toMatch(REFERENCIA_ENV_LOCAL);
    });

    it.each(archivosIntegracion)('%s abre clientes solo por la utilidad común', (nombre) => {
      const contenido = readFileSync(join(DIRECTORIO_INTEGRACION, nombre), 'utf8');
      // `createClient(` directo equivale a abrir un cliente sin pasar por la
      // guardia de loopback. Solo se permite `type SupabaseClient`.
      expect(contenido).not.toMatch(/\bcreateClient\s*[<(]/);
      if (contenido.includes('@supabase/supabase-js')) {
        expect(contenido).toContain('prepararSuiteSupabaseLocal');
      }
    });

    it.each(semillas.filter((nombre) => !SEMILLAS_SIN_URL.has(nombre)))(
      '%s exige loopback antes de abrir cliente',
      (nombre) => {
        const contenido = readFileSync(join(DIRECTORIO_SEMILLAS, nombre), 'utf8');
        expect(contenido).toContain("from './guardia-supabase-local.mjs'");
        expect(contenido).toContain('exigirSupabaseLocal(');

        const posicionGuardia = contenido.indexOf('exigirSupabaseLocal(\'');
        const posicionCliente = Math.min(
          ...[contenido.indexOf('createClient('), contenido.indexOf('await fetch(')]
            .filter((posicion) => posicion >= 0),
        );
        expect(posicionGuardia).toBeGreaterThan(0);
        expect(posicionGuardia).toBeLessThan(posicionCliente);
      },
    );

    it('la prueba de motor usa la base local y no el proyecto enlazado', () => {
      const contenido = readFileSync(join(DIRECTORIO_SEMILLAS, 'verificar-motor-capacidad.mjs'), 'utf8');
      expect(contenido).toContain("'--local'");
      expect(contenido).not.toContain("'--linked'");
    });

    it.each(semillas.filter((nombre) => nombre !== 'guardia-supabase-local.mjs'))(
      '%s no define su propio cargador de .env.local',
      (nombre) => {
        const contenido = readFileSync(join(DIRECTORIO_SEMILLAS, nombre), 'utf8');
        expect(contenido).not.toMatch(/function cargarEntornoLocal/);
        const codigo = contenido.split(/\r?\n/)
          .filter((linea) => !/^\s*(?:\/\/|\*)/.test(linea))
          .join('\n');
        expect(codigo).not.toMatch(REFERENCIA_ENV_LOCAL);
      },
    );
  });

  it('ninguna prueba de este archivo hizo peticiones de red', () => {
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});
