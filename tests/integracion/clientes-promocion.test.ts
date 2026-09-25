import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Esta suite BORRA e inserta clientes: solo puede correr contra el stack local.
const { describir, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'promoción/deduplicación de clientes',
);

const RFC_PRUEBA = `PRUEBA${'Y'.repeat(7)}`;
const RAZON_PRUEBA = 'Cliente Prueba Fase 3 Sin RFC';

describir('promoción/deduplicación de clientes (integración Fase 3)', () => {
  let clienteAdmin: SupabaseClient<Database>;

  beforeAll(async () => {
    clienteAdmin = crearClienteServicio();
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
