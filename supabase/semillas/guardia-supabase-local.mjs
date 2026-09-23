// Guardia única de aislamiento para las semillas y verificadores de QA que
// MUTAN datos. Espejo en JavaScript de `tests/utilidades/entorno-supabase.ts`
// (la paridad de `esUrlSupabaseLoopback` está cubierta por
// `tests/integracion/aislamiento-entorno.test.ts`).
//
// Motivo: estos scripts cargan `.env.local` por comodidad, y ese archivo apunta
// al proyecto remoto. Sin guardia, `CONFIRMAR_DATOS_FICTICIOS=si` bastaba para
// sembrar o borrar fixtures en producción.
import { existsSync, readFileSync } from 'node:fs';

const ANFITRIONES_LOOPBACK = new Set(['localhost', '::1', '[::1]']);
const IPV4_LOOPBACK = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Loopback estricto por `hostname` exacto: comparar por substring aceptaría
 * `https://127.0.0.1.ejemplo.net` o `https://proyecto.supabase.co/?x=localhost`.
 */
export function esUrlSupabaseLoopback(url) {
  if (typeof url !== 'string' || url.trim() === '') return false;

  let analizada;
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

/**
 * Carga `.env.local` SIN pisar lo ya definido: un `process.env` explícito
 * (el que exporta `supabase status -o env` o el job de CI) siempre gana.
 * Devuelve los nombres de variable que el archivo aportó.
 */
/** @param {string} [ruta] @param {Record<string, string | undefined>} [entorno] */
export function cargarEntornoLocal(ruta = '.env.local', entorno = process.env) {
  if (!existsSync(ruta)) return [];

  const cargadas = [];
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || entorno[coincidencia[1]] !== undefined) continue;
    entorno[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
    cargadas.push(coincidencia[1]);
  }
  return cargadas;
}

/**
 * Verifica el destino ANTES de abrir cliente o escribir. El mensaje nunca
 * incluye la URL ni la clave: revelar el host delata el proyecto remoto.
 */
/** @param {string} contexto @param {Record<string, string | undefined>} [entorno] */
export function exigirSupabaseLocal(contexto, entorno = process.env) {
  const url = entorno.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(`${contexto}: falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL.`);
  }
  if (esUrlSupabaseLoopback(url)) return url;

  throw new Error(
    `${contexto}: NEXT_PUBLIC_SUPABASE_URL no apunta a loopback. `
    + 'Estas semillas solo pueden mutar el Supabase local (supabase start).',
  );
}
