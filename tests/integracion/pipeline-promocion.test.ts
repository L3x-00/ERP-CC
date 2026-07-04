import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';

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

// RFC exclusivo de prueba, 13 caracteres. Valor determinista para que la
// limpieza (before/after) sea auto-sanadora: una corrida interrumpida deja la
// fila con este RFC y la siguiente corrida la borra antes de empezar.
const RFC_PRUEBA = `PRUEBA${'X'.repeat(7)}`;

describir('promoción de prospecto a cliente (integración)', () => {
  let clienteAdmin: SupabaseClient<Database>;

  beforeAll(async () => {
    // Se crea dentro de beforeAll (no en el cuerpo del describe) porque el
    // factory de un describe.skip igual se ejecuta al recolectar, y createClient
    // lanzaría con credenciales indefinidas.
    clienteAdmin = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    // Limpieza defensiva previa: garantiza que la primera promoción ejerza el
    // camino de insert y no un dedup contra una fila residual.
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
  });

  afterAll(async () => {
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
  });

  it('dos promociones con el mismo RFC devuelven el mismo cliente (no duplica)', async () => {
    const datos = {
      nombreComercial: 'Cliente de Prueba Integración',
      rfc: RFC_PRUEBA,
      contacto: 'Contacto de Prueba',
      correo: 'prueba-integracion@example.com',
      telefono: '6640000000',
    };

    const idPrimera = await promoverAClienteSiNoExiste(clienteAdmin, datos);
    const idSegunda = await promoverAClienteSiNoExiste(clienteAdmin, datos);

    expect(typeof idPrimera).toBe('string');
    expect(idPrimera.length).toBeGreaterThan(0);
    // Dedup por RFC: la segunda llamada reutiliza el cliente ya creado.
    expect(idSegunda).toBe(idPrimera);
  });
});
