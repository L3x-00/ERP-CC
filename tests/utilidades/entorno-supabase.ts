import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Guardia única de aislamiento para las pruebas de integración que abren un
 * cliente Supabase real.
 *
 * Reglas, en este orden:
 * 1. La única fuente de credenciales es `process.env`. Estas utilidades NUNCA
 *    leen `.env.local`: ese archivo apunta al proyecto remoto y heredarlo
 *    convertiría cualquier prueba mutadora en una escritura a producción.
 * 2. Si hay URL y no es loopback, se lanza al IMPORTAR el módulo de prueba,
 *    antes de crear ningún cliente y por tanto antes de cualquier escritura.
 * 3. Si faltan variables, la suite se omite (no hay stack local que probar).
 */

export const VARIABLE_URL = 'NEXT_PUBLIC_SUPABASE_URL';
export const VARIABLE_CLAVE_SERVICIO = 'SUPABASE_SERVICE_ROLE_KEY';
export const VARIABLE_CLAVE_ANONIMA = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

const ANFITRIONES_LOOPBACK = new Set(['localhost', '::1', '[::1]']);
const IPV4_LOOPBACK = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Loopback estricto por `hostname` exacto: comparar por substring aceptaría
 * `https://127.0.0.1.ejemplo.net` o `https://proyecto.supabase.co/?x=localhost`.
 */
export function esUrlSupabaseLoopback(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;

  let analizada: URL;
  try {
    analizada = new URL(url.trim());
  } catch {
    return false;
  }

  if (analizada.protocol !== 'http:' && analizada.protocol !== 'https:') return false;

  const anfitrion = analizada.hostname.toLowerCase();
  if (ANFITRIONES_LOOPBACK.has(anfitrion)) return true;

  const octetos = IPV4_LOOPBACK.exec(anfitrion);
  if (!octetos) return false;
  return octetos.slice(1).every((octeto) => Number(octeto) <= 255);
}

export interface EntornoSupabaseLocal {
  url: string;
  claveServicio: string;
  claveAnonima: string | undefined;
}

/** Lectura explícita: solo `process.env`, sin respaldo en archivos del repo. */
function leerVariable(nombre: string): string | undefined {
  const valor = process.env[nombre];
  return valor !== undefined && valor.trim() !== '' ? valor.trim() : undefined;
}

/**
 * Verifica el aislamiento sin exponer credenciales ni el proyecto apuntado:
 * el mensaje de error jamás incluye la URL ni la clave.
 */
export function exigirUrlLoopback(contexto: string, url: string | undefined): void {
  if (url === undefined || esUrlSupabaseLoopback(url)) return;
  throw new Error(
    `${contexto}: ${VARIABLE_URL} no apunta a loopback. `
    + 'Las pruebas de integración solo pueden mutar el Supabase local '
    + '(supabase start). Exporta el entorno del stack local antes de correrlas.',
  );
}

/**
 * Devuelve el entorno local verificado, o `null` si faltan variables.
 * Lanza si hay una URL definida que no sea loopback.
 */
export function obtenerEntornoSupabaseLocal(contexto: string): EntornoSupabaseLocal | null {
  const url = leerVariable(VARIABLE_URL);
  exigirUrlLoopback(contexto, url);

  const claveServicio = leerVariable(VARIABLE_CLAVE_SERVICIO);
  if (url === undefined || claveServicio === undefined) return null;

  return { url, claveServicio, claveAnonima: leerVariable(VARIABLE_CLAVE_ANONIMA) };
}

export interface SuiteSupabaseLocal {
  /** `describe` cuando hay stack local completo; `describe.skip` si falta. */
  describir: (nombre: string, registrar: () => void) => void;
  /** `true` si la suite quedó omitida por falta de stack local. */
  omitida: boolean;
  /** Entorno verificado. Lanza si la suite está omitida. */
  entorno(): EntornoSupabaseLocal;
  crearClienteServicio(): SupabaseClient<Database>;
  crearClienteAnonimo(): SupabaseClient<Database>;
}

export interface OpcionesSuiteSupabaseLocal {
  /** La suite también necesita la clave anónima (pruebas de RLS con sesión). */
  requiereClaveAnonima?: boolean;
}

const OPCIONES_CLIENTE = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/**
 * Punto de entrada de las suites de integración con Supabase real.
 *
 * Llamar en el cuerpo del módulo (no dentro de `beforeAll`): así la guardia de
 * loopback corre al importar el archivo, antes de que exista ningún cliente.
 */
export function prepararSuiteSupabaseLocal(
  contexto: string,
  opciones: OpcionesSuiteSupabaseLocal = {},
): SuiteSupabaseLocal {
  const entorno = obtenerEntornoSupabaseLocal(contexto);
  const completo = entorno !== null
    && (!opciones.requiereClaveAnonima || entorno.claveAnonima !== undefined);

  const exigirEntorno = (): EntornoSupabaseLocal => {
    if (entorno === null || !completo) {
      throw new Error(`${contexto}: no hay stack Supabase local configurado.`);
    }
    return entorno;
  };

  return {
    describir: completo ? describe : describe.skip,
    omitida: !completo,
    entorno: exigirEntorno,
    crearClienteServicio() {
      const { url, claveServicio } = exigirEntorno();
      // Segunda verificación: aunque alguien exporte otra URL entre el import
      // y el `beforeAll`, el cliente nunca se abre contra un destino remoto.
      exigirUrlLoopback(contexto, url);
      return createClient<Database>(url, claveServicio, OPCIONES_CLIENTE);
    },
    crearClienteAnonimo() {
      const { url, claveAnonima } = exigirEntorno();
      if (claveAnonima === undefined) {
        throw new Error(`${contexto}: falta ${VARIABLE_CLAVE_ANONIMA}.`);
      }
      exigirUrlLoopback(contexto, url);
      return createClient<Database>(url, claveAnonima, OPCIONES_CLIENTE);
    },
  };
}
