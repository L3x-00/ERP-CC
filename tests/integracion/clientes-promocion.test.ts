import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';

/** Lee una variable de `.env.local` (Vitest node no la carga sola). */
function leerVariableEnv(nombre: string): string | undefined {
  try {
    const rutaEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
    const contenido = readFileSync(rutaEnv, 'utf8');
    const coincidencia = contenido.match(new RegExp(`^${nombre}=([^\\r\\n]+)`, 'm'));
    if (coincidencia?.[1]) return coincidencia[1].trim();
  } catch {
    // `.env.local` ausente; se intenta process.env abajo.
  }
  return process.env[nombre];
}

const URL_SUPABASE = leerVariableEnv('NEXT_PUBLIC_SUPABASE_URL');
const CLAVE_SERVICE_ROLE = leerVariableEnv('SUPABASE_SERVICE_ROLE_KEY');
const faltanCredenciales = !URL_SUPABASE || !CLAVE_SERVICE_ROLE;

const describir = faltanCredenciales ? describe.skip : describe;

const RFC_PRUEBA = `PRUEBA${'Y'.repeat(7)}`;
const RAZON_PRUEBA = 'Cliente Prueba Fase 3 Sin RFC';

describir('promoción/deduplicación de clientes (integración Fase 3)', () => {
  let clienteAdmin: SupabaseClient<Database>;

  beforeAll(async () => {
    clienteAdmin = createClient<Database>(URL_SUPABASE!, CLAVE_SERVICE_ROLE!, {
      auth: { persistSession: false },
    });
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
    await clienteAdmin.from('clientes').delete().eq('razon_social', RAZON_PRUEBA);
  });

  afterAll(async () => {
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
    await clienteAdmin.from('clientes').delete().eq('razon_social', RAZON_PRUEBA);
  });

  it('dedup por RFC: dos promociones con el mismo RFC no duplican', async () => {
    const datos = {
      nombreComercial: 'ACME F3',
      razonSocial: 'ACME Manufactura F3',
      rfc: RFC_PRUEBA,
      contacto: 'Contacto F3',
      correo: 'f3-rfc@example.com',
      telefono: '6640000001',
    };
    const id1 = await promoverAClienteSiNoExiste(clienteAdmin, datos);
    const id2 = await promoverAClienteSiNoExiste(clienteAdmin, datos);
    expect(id2).toBe(id1);
  });

  it('dedup por razón social cuando no hay RFC', async () => {
    const id1 = await promoverAClienteSiNoExiste(clienteAdmin, {
      nombreComercial: 'Prueba F3',
      razonSocial: RAZON_PRUEBA,
    });
    // Segunda promoción con la MISMA razón social (distinto casing) reutiliza.
    const id2 = await promoverAClienteSiNoExiste(clienteAdmin, {
      nombreComercial: 'Prueba F3',
      razonSocial: RAZON_PRUEBA.toLowerCase(),
    });
    expect(id2).toBe(id1);
  });

  it('enriquece sin sobrescribir: rellena solo campos vacíos', async () => {
    // Alta sin correo.
    const id1 = await promoverAClienteSiNoExiste(clienteAdmin, {
      nombreComercial: 'Prueba F3',
      razonSocial: RAZON_PRUEBA,
    });
    // Segunda promoción aporta correo → debe rellenarlo.
    await promoverAClienteSiNoExiste(clienteAdmin, {
      nombreComercial: 'Prueba F3',
      razonSocial: RAZON_PRUEBA,
      correo: 'enriquecido-f3@example.com',
    });
    const { data } = await clienteAdmin
      .from('clientes')
      .select('correo')
      .eq('id', id1)
      .single();
    expect(data?.correo).toBe('enriquecido-f3@example.com');
  });
});
