import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Lee una variable de `.env.local` (o de `process.env` como respaldo).
 *
 * Vitest en entorno `node` NO carga `.env.local` automáticamente, así que se
 * lee el archivo del root del repo con `readFileSync` + regex. Se acepta tanto
 * LF como CRLF (`[^\r\n]+` en vez de anclar con `$`, que falla ante el `\r`).
 */
function leerVariableEnv(nombre: string): string | undefined {
  try {
    const rutaEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
    const contenido = readFileSync(rutaEnv, 'utf8');
    const coincidencia = contenido.match(new RegExp(`^${nombre}=([^\\r\\n]+)`, 'm'));
    if (coincidencia?.[1]) return coincidencia[1].trim();
  } catch {
    // `.env.local` ausente en este entorno; se intenta `process.env` abajo.
  }
  return process.env[nombre];
}

const URL_SUPABASE = leerVariableEnv('NEXT_PUBLIC_SUPABASE_URL');
const CLAVE_SERVICE_ROLE = leerVariableEnv('SUPABASE_SERVICE_ROLE_KEY');
const faltanCredenciales = !URL_SUPABASE || !CLAVE_SERVICE_ROLE;

// Guardia de entorno: sin credenciales de service-role no hay BD real que probar.
const describir = faltanCredenciales ? describe.skip : describe;

describir('folios de pipeline bajo concurrencia (integración)', () => {
  let cliente: SupabaseClient<Database>;

  beforeAll(() => {
    // Se crea dentro de beforeAll (no en el cuerpo del describe) porque el
    // factory de un describe.skip igual se ejecuta al recolectar, y createClient
    // lanzaría con credenciales indefinidas.
    cliente = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
  });

  it('10 llamadas concurrentes a generar_folio_op producen 10 folios distintos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => cliente.rpc('generar_folio_op')),
    );

    const folios: string[] = [];
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull();
      expect(resultado.data).toBeTruthy();
      folios.push(resultado.data ?? '');
    }

    expect(new Set(folios).size).toBe(10);
    for (const folio of folios) {
      expect(folio).toMatch(/^OP-\d{4,}$/);
    }
  });

  it('10 llamadas concurrentes a generar_folio_cnc producen 10 folios distintos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => cliente.rpc('generar_folio_cnc')),
    );

    const folios: string[] = [];
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull();
      expect(resultado.data).toBeTruthy();
      folios.push(resultado.data ?? '');
    }

    expect(new Set(folios).size).toBe(10);
    for (const folio of folios) {
      expect(folio).toMatch(/^CNC-\d{4}-\d{4,}$/);
    }
  });
});
